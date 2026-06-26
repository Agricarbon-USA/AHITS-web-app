import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { returnConditionToLogCondition, getUnitsInOtherRigs } from '@/lib/check-log-helpers'
import { withIdempotency } from '@/lib/idempotency'
import { restoreToHub } from '@/lib/inventory-stock'

const bodySchema = z.object({
  quantity: z.number().int().min(1).optional(),
  returnCondition: z.enum(['GOOD', 'IN_MAINTENANCE', 'INOPERABLE']).optional(),
  // G1: optional destination hub override. When omitted, restore falls back to
  // the drawn hub then the item's home hub; if none resolves, the request is
  // rejected (below) so consumable stock is never silently lost.
  hubId: z.string().optional(),
  notes: z.string().optional(),
  // Daily-usage logging reuses this return endpoint but means "consumed in the
  // field," not "returned to the hub." When true, consumable stock is NOT
  // restored (the item was used up). Genuine returns omit it / pass false.
  consumed: z.boolean().optional(),
})

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; kitItemId: string }> }
) {
  return withIdempotency(req, 'deployments.items.kitItem.DELETE', () => _DELETE(req, ctx))
}

async function _DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kitItemId: string }> }
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: rigId, kitItemId } = await params

  const rig = await prisma.rig.findUnique({ where: { id: rigId } })
  if (!rig) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (rig.endedAt) return NextResponse.json({ error: 'Deployment has ended' }, { status: 409 })
  if (session.role !== 'ADMIN' && rig.operatorId !== session.userId) {
    const secondary = await prisma.rigOperator.findUnique({
      where: { rigId_operatorId: { rigId, operatorId: session.userId } },
    })
    if (!secondary) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const kitItem = await prisma.kitItem.findUnique({
    where: { id: kitItemId },
    include: { item: { select: { itemType: true, hubId: true } }, kit: { select: { rigId: true } } },
  })
  if (!kitItem || kitItem.removedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (kitItem.kit.rigId !== rigId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 })

  const returnCondition = body.data.returnCondition ?? 'GOOD'
  const isSerialized = kitItem.item.itemType === 'SERIALIZED'
  const newUnitStatus =
    returnCondition === 'IN_MAINTENANCE' ? 'IN_MAINTENANCE'
    : returnCondition === 'INOPERABLE' ? 'INOPERABLE'
    : 'AVAILABLE'

  // G1: a genuine consumable return must land in a real hub. Resolve the
  // destination (chosen → drawn → home) and reject up front if none exists, so
  // stock is never credited to the cross-hub total with no per-hub home (the
  // "disappeared from hub views" bug).
  const willRestore = !isSerialized && returnCondition === 'GOOD' && !body.data.consumed && (kitItem.drawnQuantity ?? 0) > 0
  const resolvedHub = body.data.hubId ?? kitItem.drawnHubId ?? kitItem.item.hubId
  if (willRestore && !resolvedHub) {
    return NextResponse.json({ error: 'A return hub is required for this item.' }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    if (isSerialized) {
      // Claim the removal conditionally (CR-17): if a concurrent return already
      // flipped removedAt, this matches 0 rows and we skip — no double unit flip.
      const claimed = await tx.kitItem.updateMany({
        where: { id: kitItemId, removedAt: null },
        data: { removedAt: new Date() },
      })
      if (claimed.count === 0) return
      if (kitItem.inventoryUnitId) {
        await tx.inventoryUnit.update({
          where: { id: kitItem.inventoryUnitId },
          data: { status: newUnitStatus },
        })
        await tx.checkLog.create({
          data: {
            action: 'CHECK_IN',
            itemId: kitItem.inventoryItemId,
            inventoryUnitId: kitItem.inventoryUnitId,
            operatorId: session.userId,
            rigId,
            notes: body.data.notes,
            condition: returnConditionToLogCondition(returnCondition),
          },
        })
      }
    } else {
      const removeQty = body.data.quantity ?? kitItem.quantity
      const drawn = kitItem.drawnQuantity ?? 0
      // Restore exactly what was drawn at check-out, never more (CR-1a / N-2):
      // a full return gives back all remaining drawn stock; a partial return
      // gives back its proportional share, capped at what's left to restore.
      let restoreQty = 0
      // Claim the removal/decrement conditionally (CR-17): two concurrent returns
      // of the same consumable kit item must not BOTH restore stock. The loser
      // matches 0 rows and bails before the increment below.
      if (removeQty >= kitItem.quantity) {
        const claimed = await tx.kitItem.updateMany({
          where: { id: kitItemId, removedAt: null },
          data: { removedAt: new Date() },
        })
        if (claimed.count === 0) return
        restoreQty = drawn
      } else {
        restoreQty = Math.min(removeQty, drawn)
        const claimed = await tx.kitItem.updateMany({
          where: { id: kitItemId, removedAt: null, quantity: { gte: removeQty } },
          data: { quantity: { decrement: removeQty }, drawnQuantity: { decrement: restoreQty } },
        })
        if (claimed.count === 0) return
      }
      if (returnCondition === 'GOOD' && !body.data.consumed && restoreQty > 0) {
        // Genuine return: restore hub stock (MH-1 dual-write) + cross-hub total.
        // G1: `resolvedHub` is guaranteed non-null here (checked above), so the
        // per-hub credit always lands — no silent loss. Chosen hub also re-anchors
        // the item's home hub so it stays visible in hub-filtered views.
        const hubForRestore = (resolvedHub as string)
        await restoreToHub(kitItem.inventoryItemId, hubForRestore, restoreQty, tx)
        await tx.inventoryItem.update({
          where: { id: kitItem.inventoryItemId },
          data: { quantity: { increment: restoreQty }, ...(body.data.hubId ? { hubId: body.data.hubId } : {}) },
        })
      }
      const excludeUnitIds = await getUnitsInOtherRigs(tx, kitItem.inventoryItemId, rigId)
      const units = await tx.inventoryUnit.findMany({
        where: {
          inventoryItemId: kitItem.inventoryItemId,
          status: 'CHECKED_OUT',
          ...(excludeUnitIds.length > 0 && { id: { notIn: excludeUnitIds } }),
        },
        take: removeQty,
        orderBy: { createdAt: 'asc' },
      })
      if (units.length > 0) {
        await tx.inventoryUnit.updateMany({
          where: { id: { in: units.map((u) => u.id) } },
          data: { status: newUnitStatus === 'AVAILABLE' ? 'AVAILABLE' : newUnitStatus },
        })
      }
      await tx.checkLog.create({
        data: {
          action: 'CHECK_IN',
          itemId: kitItem.inventoryItemId,
          operatorId: session.userId,
          rigId,
          notes: body.data.notes,
          condition: returnConditionToLogCondition(returnCondition),
        },
      })
    }
  })

  return NextResponse.json({ ok: true })
}
