import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
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
    where: { qrCodeId: key },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      qrCodeId: true,
      location: true,
      odometer: true,
      assignedOperatorId: true,
    },
  })

  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })

  return NextResponse.json({ vehicle })
}
