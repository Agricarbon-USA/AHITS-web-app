import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

const schema = z.object({
  responseNote: z.string().optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const transfer = await prisma.transferRequest.findUnique({
    where: { id },
    include: {
      fromRig: {
        select: {
          id: true,
          operatorId: true,
          operator: { select: { id: true, name: true } },
        },
      },
      vehicles: true,
      items: { include: { kitItem: { select: { inventoryItemId: true, quantity: true, inventoryUnitId: true } } } },
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
  const toOperatorId = transfer.toOperatorId
  const sourceName = transfer.fromRig.operator.name

  let updatedTransfer
  try {
    updatedTransfer = await prisma.$transaction(async (tx) => {
    // Guard: verify source rig is still active (not ended since transfer was created)
    const sourceRig = await tx.rig.findUnique({ where: { id: transfer.fromRig.id }, select: { endedAt: true } })
    if (sourceRig?.endedAt) {
      throw new Error('Source deployment has ended — transfer is no longer valid')
    }

    // Guard: verify each vehicle is still in the source rig (not double-transferred)
    for (const tv of transfer.vehicles) {
      const stillPresent = await tx.rigVehicle.findFirst({
        where: { rigId: transfer.fromRig.id, vehicleId: tv.vehicleId, removedAt: null },
      })
      if (!stillPresent) {
        throw new Error(`Vehicle is no longer in the source deployment`)
      }
    }

    // Guard: verify each kit item is still in the source rig (not double-transferred)
    for (const ti of transfer.items) {
      const stillPresent = await tx.kitItem.findFirst({
        where: { id: ti.kitItemId, removedAt: null },
      })
      if (!stillPresent) {
        throw new Error(`Kit item is no longer in the source deployment`)
      }
    }

    // Find or create destination rig (source rig stays active regardless)
    let destRig = await tx.rig.findFirst({
      where: { operatorId: toOperatorId, endedAt: null },
    })
    if (!destRig) {
      destRig = await tx.rig.create({
        data: { operatorId: toOperatorId, startedAt: now },
      })
    }

    // Find or create destination kit
    let destKit = await tx.kit.findFirst({ where: { rigId: destRig.id } })
    if (!destKit) {
      destKit = await tx.kit.create({ data: { rigId: destRig.id } })
    }

    // Transfer vehicles (only removes transferred ones — source deployment stays active)
    for (const tv of transfer.vehicles) {
      await tx.rigVehicle.updateMany({
        where: { rigId: transfer.fromRig.id, vehicleId: tv.vehicleId, removedAt: null },
        data: { removedAt: now, removeNote: transfer.note },
      })
      await tx.rigVehicle.create({
        data: {
          rigId: destRig.id,
          vehicleId: tv.vehicleId,
          addNote: `Accepted transfer from ${sourceName}`,
          photoUrls: transfer.photoUrls,
        },
      })
      await tx.vehicle.update({
        where: { id: tv.vehicleId },
        data: { assignedOperatorId: toOperatorId },
      })
    }

    // Transfer kit items (only removes transferred items — remaining items stay in source rig)
    for (const ti of transfer.items) {
      await tx.kitItem.update({
        where: { id: ti.kitItemId },
        data: { removedAt: now },
      })
      await tx.kitItem.create({
        data: {
          kitId: destKit.id,
          inventoryItemId: ti.kitItem.inventoryItemId,
          quantity: ti.kitItem.quantity,
          inventoryUnitId: ti.kitItem.inventoryUnitId ?? null,
        },
      })
      await tx.checkLog.create({
        data: {
          action: 'CHECK_IN',
          itemId: ti.kitItem.inventoryItemId,
          operatorId: transfer.fromRig.operatorId,
          notes: transfer.note,
        },
      })
      await tx.checkLog.create({
        data: {
          action: 'CHECK_OUT',
          itemId: ti.kitItem.inventoryItemId,
          operatorId: toOperatorId,
          notes: 'Accepted transfer',
        },
      })
    }

    // Auto-end source deployment if now completely empty
    const remainingVehicles = await tx.rigVehicle.count({
      where: { rigId: transfer.fromRig.id, removedAt: null },
    })
    const sourceKits = await tx.kit.findMany({
      where: { rigId: transfer.fromRig.id },
      select: { items: { where: { removedAt: null }, select: { id: true } } },
    })
    const remainingItems = sourceKits.reduce((sum, k) => sum + k.items.length, 0)
    if (remainingVehicles === 0 && remainingItems === 0) {
      await tx.rig.update({ where: { id: transfer.fromRig.id }, data: { endedAt: now } })
    }

      return tx.transferRequest.update({
        where: { id },
        data: {
          status: 'ACCEPTED',
          respondedAt: now,
          responseNote: responseNote ?? null,
        },
      })
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Transfer failed'
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  return NextResponse.json({ ok: true, transferRequest: updatedTransfer })
}
