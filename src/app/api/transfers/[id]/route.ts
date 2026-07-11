import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { restoreToHub, resyncItemTotal } from '@/lib/inventory-stock'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
              id: true,
              inventoryItemId: true,
              inventoryUnitId: true,
              quantity: true,
              drawnQuantity: true,
              drawnHubId: true,
              removedAt: true,
              item: { select: { itemType: true, hubId: true } },
            },
          },
        },
      },
      vehicles: { select: { vehicleId: true } },
    },
  })
  if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (transfer.status !== 'PENDING') {
    return NextResponse.json({ error: 'Transfer is no longer pending' }, { status: 409 })
  }

  // Only admin or the initiator can cancel
  if (session.role !== 'ADMIN' && transfer.initiatedById !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = new Date()

  try {
    await prisma.$transaction(async (tx) => {
      // Conditional flip — cancel racing an accept/decline loses and throws.
      const cancelled = await tx.transferRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      })
      if (cancelled.count === 0) {
        throw new Error('Transfer is no longer pending')
      }

      // If the source deployment already ended, restore kit items and close vehicle rows.
      // Active-rig items stay in the source kit unchanged (same as decline path).
      const sourceRig = await tx.rig.findUnique({
        where: { id: transfer.fromRigId },
        select: { endedAt: true },
      })
      if (sourceRig?.endedAt) {
        for (const ti of transfer.items) {
          const kitItem = ti.kitItem
          if (kitItem.removedAt) continue

          if (kitItem.item.itemType === 'CONSUMABLE' && (kitItem.drawnQuantity ?? 0) > 0) {
            const hubForRestore = kitItem.drawnHubId ?? kitItem.item.hubId
            if (hubForRestore) {
              await restoreToHub(kitItem.inventoryItemId, hubForRestore, kitItem.drawnQuantity!, tx)
              await resyncItemTotal(kitItem.inventoryItemId, tx)
            }
          }

          await tx.kitItem.update({ where: { id: kitItem.id }, data: { removedAt: now } })

          if (kitItem.inventoryUnitId) {
            await tx.inventoryUnit.update({
              where: { id: kitItem.inventoryUnitId },
              data: { status: 'AVAILABLE' },
            })
          } else {
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

          await tx.checkLog.create({
            data: {
              action: 'CHECK_IN',
              itemId: kitItem.inventoryItemId,
              inventoryUnitId: kitItem.inventoryUnitId ?? undefined,
              operatorId: session.userId,
              rigId: transfer.fromRigId,
              notes: 'Transfer cancelled. Units returned to inventory.',
            },
          })
        }

        // Close vehicle rows held open by this transfer (mirrors decline path).
        const vehicleIds = transfer.vehicles.map((v) => v.vehicleId)
        if (vehicleIds.length > 0) {
          await tx.rigVehicle.updateMany({
            where: { rigId: transfer.fromRigId, vehicleId: { in: vehicleIds }, removedAt: null },
            data: { removedAt: now },
          })
          await tx.vehicle.updateMany({
            where: { id: { in: vehicleIds } },
            data: { assignedOperatorId: null },
          })
        }
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Cancel failed'
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}
