import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { returnConditionToLogCondition } from '@/lib/check-log-helpers'
import { withIdempotency } from '@/lib/idempotency'
import { consumeConsumableStock } from '@/lib/consumables'
import { createDamageReport } from '@/lib/maintenance'

const bodySchema = z.object({
  quantity: z.number().int().min(1).optional(),
  returnCondition: z.enum(['GOOD', 'IN_MAINTENANCE', 'INOPERABLE']).optional(),
  // RETURN (default): the quantity goes back to stock (reservation released).
  // CONSUME: the quantity was used/lost in the field — permanently reduce stock.
  mode: z.enum(['RETURN', 'CONSUME']).optional(),
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
    include: { item: { select: { itemType: true, name: true } }, kit: { select: { rigId: true } } },
  })
  if (!kitItem || kitItem.removedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (kitItem.kit.rigId !== rigId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 })

  const returnCondition = body.data.returnCondition ?? 'GOOD'
  const mode = body.data.mode ?? 'RETURN'
  const isSerialized = kitItem.item.itemType === 'SERIALIZED'

  await prisma.$transaction(async (tx) => {
    if (isSerialized) {
      await tx.kitItem.update({ where: { id: kitItemId }, data: { removedAt: new Date() } })
      if (kitItem.inventoryUnitId) {
        if (returnCondition === 'GOOD') {
          await tx.inventoryUnit.update({
            where: { id: kitItem.inventoryUnitId },
            data: { status: 'AVAILABLE' },
          })
          await tx.checkLog.create({
            data: {
              action: 'CHECK_IN',
              itemId: kitItem.inventoryItemId,
              inventoryUnitId: kitItem.inventoryUnitId,
              operatorId: session.userId,
              rigId,
              notes: body.data.notes,
              condition: 'GOOD',
            },
          })
        } else {
          // Needs-maintenance / inoperable quick return: log it AND open a damage
          // report (DAT-5). This path previously flipped the unit silently with no
          // task and no alert, so routine damage notified no one.
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
          await createDamageReport(tx, {
            inventoryItemId: kitItem.inventoryItemId,
            inventoryUnitId: kitItem.inventoryUnitId,
            itemName: kitItem.item.name,
            operatorId: session.userId,
            canBeFixed: returnCondition === 'IN_MAINTENANCE',
            inoperableNotes: body.data.notes,
          }, new Date())
        }
      }
    } else {
      // CONSUMABLE kit item — no unit rows. Reduce or remove the reservation.
      const removeQty = body.data.quantity ?? kitItem.quantity
      if (removeQty >= kitItem.quantity) {
        await tx.kitItem.update({ where: { id: kitItemId }, data: { removedAt: new Date() } })
      } else {
        await tx.kitItem.update({
          where: { id: kitItemId },
          data: { quantity: kitItem.quantity - removeQty },
        })
      }
      // A plain RETURN just releases the reservation (raising derived
      // availability). Field usage (CONSUME) or a damaged/inoperable return is a
      // permanent loss, so decrement owned stock.
      if (mode === 'CONSUME' || returnCondition !== 'GOOD') {
        await consumeConsumableStock(tx, kitItem.inventoryItemId, removeQty)
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
