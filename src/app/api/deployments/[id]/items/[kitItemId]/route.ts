import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { isAuthorizedForRig } from '@/lib/deployment-auth'
import { requireAuth } from '@/lib/auth/session'
import { returnConditionToLogCondition, getUnitsInOtherRigs } from '@/lib/check-log-helpers'
import { withIdempotency } from '@/lib/idempotency'
import { restoreToHub, resyncItemTotal } from '@/lib/inventory-stock'
import { issueHubReturnLinks } from '@/lib/status-links'
import { releaseUnlinkedReturns, returnUnit } from '@/lib/asset-status'
import { referenceConflictBody } from '@/lib/asset-references'
import { isConsumableWriteOff, recordWriteOff, writeOffNotes } from '@/lib/item-rules'

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
  if (!(await isAuthorizedForRig(rig, session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const kitItem = await prisma.kitItem.findUnique({
    where: { id: kitItemId },
    include: { item: { select: { itemType: true, hubId: true, name: true } }, kit: { select: { rigId: true } } },
  })
  if (!kitItem || kitItem.removedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (kitItem.kit.rigId !== rigId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 })

  const returnCondition = body.data.returnCondition ?? 'GOOD'
  const isSerialized = kitItem.item.itemType === 'SERIALIZED'

  // G1: a genuine consumable return must land in a real hub. Resolve the
  // destination (chosen → drawn → home) and reject up front if none exists, so
  // stock is never credited to the cross-hub total with no per-hub home (the
  // "disappeared from hub views" bug).
  const willRestore = !isSerialized && returnCondition === 'GOOD' && !body.data.consumed && (kitItem.drawnQuantity ?? 0) > 0
  const resolvedHub = body.data.hubId ?? kitItem.drawnHubId ?? kitItem.item.hubId
  if (willRestore && !resolvedHub) {
    return NextResponse.json({ error: 'A return hub is required for this item.' }, { status: 400 })
  }

  // PR-3a: units follow the one return rule (`returnUnit`) — the same as bulk return and
  // end of deployment. GOOD → Returning (IN_TRANSIT) with a HUB_RETURN link issued after
  // commit when there is a hub to send it to (this path never issued one before), else
  // AVAILABLE; damaged → an open damage task that pulls the unit (CC-34 1c's task + bell,
  // now via openDamageTask — an INOPERABLE scan-return lands In Maintenance with a repair
  // rather than in the inoperable review queue); already in repair → stays in repair,
  // the hub recorded as its destination (D-d).
  const damageTask = {
    itemId: kitItem.inventoryItemId,
    taskName: `Damage repair: ${kitItem.item.name}`,
    notes: body.data.notes ?? null,
    rigId,
    reportedById: session.userId,
    alertMeta: { itemName: kitItem.item.name, operatorId: session.userId },
  }
  let returningUnitId: string | null = null
  // PR-6 (D-x): a consumable returned IN_MAINTENANCE / INOPERABLE is written off.
  const writeOff = isConsumableWriteOff(kitItem.item.itemType, 'HUB', returnCondition)

  try {
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
        const ended = await returnUnit(tx, kitItem.inventoryUnitId, {
          condition: returnCondition,
          hubId: resolvedHub,
          linked: !!resolvedHub,
          task: damageTask,
        })
        if (ended === 'IN_TRANSIT') returningUnitId = kitItem.inventoryUnitId
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
        // #106: recompute the cross-hub total from stock rows (one discipline for every
        // return path) rather than a blind increment — self-heals drift. The hub re-anchor
        // is a separate field, kept as its own update.
        await resyncItemTotal(kitItem.inventoryItemId, tx)
        if (body.data.hubId) {
          await tx.inventoryItem.update({
            where: { id: kitItem.inventoryItemId },
            data: { hubId: body.data.hubId },
          })
        }
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
      // PR-6 (D-z): the sweep still runs for a consumable whatever was declared, but a
      // legacy unit always comes home GOOD → AVAILABLE and never gets a task.
      for (const u of units) {
        await returnUnit(tx, u.id, { condition: 'GOOD', hubId: resolvedHub, linked: false, task: damageTask })
      }
      if (writeOff) {
        await recordWriteOff(tx, {
          itemId: kitItem.inventoryItemId,
          operatorId: session.userId,
          rigId,
          notes: writeOffNotes(body.data.notes),
          uploadedById: session.userId,
        })
      } else {
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
    }
  })
  } catch (err) {
    // PR-6: a ReferenceConflict is a 409 (terminal for the offline queue, message shown).
    const conflict = referenceConflictBody(err)
    if (conflict) return NextResponse.json(conflict, { status: 409 })
    throw err
  }

  // Best-effort, after commit: the Returning unit's HUB_RETURN link; if it can't be issued
  // the unit falls back to AVAILABLE rather than sit Returning with nothing to confirm.
  if (returningUnitId && resolvedHub) {
    try {
      await issueHubReturnLinks(session.userId, [{ kitItemId, hubId: resolvedHub }])
    } catch (e) {
      console.error('[single return hub-return link issue]', e)
      await releaseUnlinkedReturns([returningUnitId]).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true })
}
