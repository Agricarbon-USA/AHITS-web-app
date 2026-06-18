import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { withIdempotency } from '@/lib/idempotency'

const schema = z.object({
  responseNote: z.string().optional(),
})

// Declining can restore units for an ended-rig transfer and writes CheckLogs —
// guard against replay double-application.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withIdempotency(req, 'transfers.decline.POST', () => _POST(req, ctx))
}

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const transfer = await prisma.transferRequest.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          kitItem: {
            select: {
              id: true, inventoryItemId: true, inventoryUnitId: true, quantity: true, removedAt: true,
              item: { select: { itemType: true } },
            },
          },
        },
      },
    },
  })
  if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (transfer.status !== 'PENDING') {
    return NextResponse.json({ error: 'Transfer is no longer pending' }, { status: 409 })
  }

  const isDestination = transfer.toOperatorId === session.userId
  const isAdmin = session.role === 'ADMIN'
  if (!isDestination && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { responseNote } = parsed.data

  const now = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.transferRequest.update({
      where: { id },
      data: { status: 'DECLINED', respondedAt: now, responseNote: responseNote ?? null },
    })

    // For end-of-deployment transfers (source rig ended), restore units and mark kit items removed.
    // For active-rig transfers, items stay in the source kit unchanged.
    const sourceRig = await tx.rig.findUnique({
      where: { id: transfer.fromRigId },
      select: { endedAt: true },
    })
    if (sourceRig?.endedAt) {
      for (const ti of transfer.items) {
        const kitItem = ti.kitItem
        if (kitItem.removedAt) continue

        await tx.kitItem.update({ where: { id: kitItem.id }, data: { removedAt: now } })

        if (kitItem.inventoryUnitId) {
          await tx.inventoryUnit.update({
            where: { id: kitItem.inventoryUnitId },
            data: { status: 'AVAILABLE' },
          })
        } else if (kitItem.item.itemType === 'SERIALIZED') {
          const units = await tx.inventoryUnit.findMany({
            where: { inventoryItemId: kitItem.inventoryItemId, status: 'CHECKED_OUT' },
            take: kitItem.quantity,
          })
          if (units.length > 0) {
            await tx.inventoryUnit.updateMany({
              where: { id: { in: units.map((u) => u.id) } },
              data: { status: 'AVAILABLE' },
            })
          }
        }
        // CONSUMABLE: marking the kit item removed (above) releases the
        // reservation, returning the quantity to available stock. No unit rows.
        await tx.checkLog.create({
          data: {
            action: 'CHECK_IN',
            itemId: kitItem.inventoryItemId,
            inventoryUnitId: kitItem.inventoryUnitId ?? undefined,
            operatorId: session.userId,
            rigId: transfer.fromRigId,
            notes: `Transfer declined: ${responseNote ?? 'no reason given'}. Units returned to inventory.`,
          },
        })
      }
    }
  })

  return NextResponse.json({ ok: true })
}
