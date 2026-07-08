import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getVehicleOperators } from '@/lib/deployment-assignments'
import { requireAuth } from '@/lib/auth/session'
import { parseScannedCode } from '@/lib/qr'

// GET /api/vehicles/by-qr/[qrCodeId]
// Resolve a scanned QR payload to a Vehicle. Mirrors the inventory-unit
// by-qr route so the operator Scan screen can route a vehicle label straight
// to "Start Daily Check" (PRD §7.7 Scan Actions). Tolerates a full URL payload
// by using its last path segment.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ qrCodeId: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { qrCodeId } = await params
  const key = parseScannedCode(decodeURIComponent(qrCodeId))

  const vehicle = await prisma.vehicle.findFirst({
    where: { qrCodeId: key, deletedAt: null },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      qrCodeId: true,
      location: true,
      odometer: true,
    },
  })

  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })

  // W0-10 PR-1: assigned operator from the assignment table, not Vehicle.assignedOperatorId.
  const assignedOperatorId = (await getVehicleOperators([vehicle.id])).get(vehicle.id)?.operatorId ?? null
  return NextResponse.json({ vehicle: { ...vehicle, assignedOperatorId } })
}
