import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { returnConditionToLogCondition, getUnitsInOtherRigs } from '@/lib/check-log-helpers'
import { withIdempotency } from '@/lib/idempotency'

const bodySchema = z.object({
  quantity: z.number().int().min(1).optional(),
  returnCondition: z.enum(['GOOD', 'IN_MAINTENANCE', 'INOPERABLE']).optional(),
  notes: z.string().optional(),
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
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: rigId, kitItemId } = await params

  const rig = await prisma.rig.findUnique({ where: { id: rigId } })
  if (!rig) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (rig.endedAt) return NextResponse.json({ error: 'Deployment has ended' }, { status: 409 })
  if (session.role !== 'ADMIN' && rig.operatorId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const kitItem = await prisma.kitItem.findUnique({
    where: { id: kitItemId },
    include: { item: { select: { itemType: true } }, kit: { select: { rigId: true } } },
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

  await prisma.$transaction(async (tx) => {
    if (isSerialized) {
      await tx.kitItem.update({ where: { id: kitItemId }, data: { removedAt: new Date() } })
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
      if (removeQty >= kitItem.quantity) {
        await tx.kitItem.update({ where: { id: kitItemId }, data: { removedAt: new Date() } })
      } else {
        await tx.kitItem.update({
          where: { id: kitItemId },
          data: { quantity: kitItem.quantity - removeQty },
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
