import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const transfer = await prisma.transferRequest.findUnique({ where: { id } })
  if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (transfer.status !== 'PENDING') {
    return NextResponse.json({ error: 'Transfer is no longer pending' }, { status: 409 })
  }

  // Only admin or the initiator can cancel
  if (session.role !== 'ADMIN' && transfer.initiatedById !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Conditional flip so a cancel racing an accept/decline can't override a
  // already-resolved transfer.
  const cancelled = await prisma.transferRequest.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  })
  if (cancelled.count === 0) {
    return NextResponse.json({ error: 'Transfer is no longer pending' }, { status: 409 })
  }

  // W0-10 PR-2b: if the source deployment already ended, close the vehicle rows this
  // cancelled transfer was holding open (end-of-deployment keeps a pending transfer's
  // vehicles open) so the vehicle is freed instead of stranding as "on an active
  // deployment". Mirrors the decline path.
  const tvs = await prisma.transferVehicle.findMany({
    where: { transferRequestId: id },
    select: { vehicleId: true },
  })
  if (tvs.length > 0) {
    const sourceRig = await prisma.rig.findUnique({
      where: { id: transfer.fromRigId },
      select: { endedAt: true },
    })
    if (sourceRig?.endedAt) {
      const vehicleIds = tvs.map((v) => v.vehicleId)
      await prisma.$transaction([
        prisma.rigVehicle.updateMany({
          where: { rigId: transfer.fromRigId, vehicleId: { in: vehicleIds }, removedAt: null },
          data: { removedAt: new Date() },
        }),
        prisma.vehicle.updateMany({
          where: { id: { in: vehicleIds } },
          data: { assignedOperatorId: null },
        }),
      ])
    }
  }

  return NextResponse.json({ ok: true })
}
