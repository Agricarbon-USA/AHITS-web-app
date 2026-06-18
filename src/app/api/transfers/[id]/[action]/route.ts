import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, action } = await params

  if (action !== 'accept' && action !== 'decline') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const transfer = await prisma.transferRequest.findUnique({
    where: { id },
    include: {
      fromRig: {
        include: {
          vehicles: { where: { removedAt: null } },
          kits: { include: { items: { where: { removedAt: null } } } },
        },
      },
      vehicles: true,
      items: true,
    },
  })

  if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (transfer.status !== 'PENDING') {
    return NextResponse.json({ error: 'Transfer is no longer pending' }, { status: 409 })
  }

  // Only admin or the destination operator can accept/decline
  if (session.role !== 'ADMIN' && transfer.toOperatorId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const responseNote: string | undefined = body.responseNote

  if (action === 'decline') {
    await prisma.transferRequest.update({
      where: { id },
      data: { status: 'DECLINED', responseNote, respondedAt: new Date() },
    })
    return NextResponse.json({ ok: true })
  }

  // Accept: move vehicles and kit items to destination operator's active rig (or new rig)
  await prisma.$transaction(async (tx) => {
    const now = new Date()

    // Find or create an active rig for the destination operator
    let destRig = await tx.rig.findFirst({
      where: { operatorId: transfer.toOperatorId, endedAt: null },
    })

    if (!destRig) {
      destRig = await tx.rig.create({
        data: {
          operatorId: transfer.toOperatorId,
          startedAt: now,
          label: `Transfer from ${transfer.fromRig.operatorId}`,
        },
      })
    }

    const vehicleIdsToTransfer = new Set(transfer.vehicles.map((tv) => tv.vehicleId))
    const kitItemIdsToTransfer = new Set(transfer.items.map((ti) => ti.kitItemId))

    // Move vehicles: remove from source rig, add to dest rig
    if (vehicleIdsToTransfer.size > 0) {
      await tx.rigVehicle.updateMany({
        where: {
          rigId: transfer.fromRigId,
          vehicleId: { in: Array.from(vehicleIdsToTransfer) },
          removedAt: null,
        },
        data: { removedAt: now },
      })

      await tx.rigVehicle.createMany({
        data: Array.from(vehicleIdsToTransfer).map((vehicleId) => ({
          rigId: destRig.id,
          vehicleId,
          addedAt: now,
          addNote: `Transferred from rig ${transfer.fromRigId}`,
        })),
      })
    }

    // Move kit items: remove from source kit, add to dest kit
    if (kitItemIdsToTransfer.size > 0) {
      // Get or create a kit for the dest rig
      let destKit = await tx.kit.findFirst({ where: { rigId: destRig.id } })
      if (!destKit) {
        destKit = await tx.kit.create({ data: { rigId: destRig.id } })
      }

      for (const transferItem of transfer.items) {
        // Soft-remove from source kit
        await tx.kitItem.update({
          where: { id: transferItem.kitItemId },
          data: { removedAt: now },
        })

        // Find the source kit item to get inventory details
        const srcKitItem = await tx.kitItem.findUnique({
          where: { id: transferItem.kitItemId },
        })
        if (!srcKitItem) continue

        // Add to dest kit
        await tx.kitItem.create({
          data: {
            kitId: destKit.id,
            inventoryItemId: srcKitItem.inventoryItemId,
            quantity: transferItem.quantity ?? srcKitItem.quantity,
            inventoryUnitId: transferItem.inventoryUnitId ?? srcKitItem.inventoryUnitId,
            addedAt: now,
          },
        })
      }
    }

    // Mark transfer as accepted
    await tx.transferRequest.update({
      where: { id },
      data: { status: 'ACCEPTED', responseNote, respondedAt: now },
    })
  })

  return NextResponse.json({ ok: true })
}
