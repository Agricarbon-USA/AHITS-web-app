import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { VehicleType, VehicleStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireAdmin } from '@/lib/auth/session'

// Whitelist of admin-editable fields. Excludes id/createdAt/updatedAt and
// qrCodeId (QR association is set on create, not via a generic edit) to prevent
// mass-assignment. `.strict()` rejects any unexpected key.
const vehicleUpdateSchema = z
  .object({
    name: z.string().min(1),
    type: z.nativeEnum(VehicleType),
    year: z.number().int().nullable(),
    makeModel: z.string().nullable(),
    vin: z.string().nullable(),
    licensePlate: z.string().nullable(),
    odometer: z.number().int().nullable(),
    status: z.nativeEnum(VehicleStatus),
    location: z.string().nullable(),
    assignedOperatorId: z.string().nullable(),
    insuranceExpires: z.coerce.date().nullable(),
    registrationExpires: z.coerce.date().nullable(),
    notes: z.string().nullable(),
  })
  .partial()
  .strict()

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, deletedAt: null },
    include: {
      dailyChecks: { orderBy: { date: 'desc' }, take: 10, include: { operator: true } },
      maintenanceTasks: { orderBy: { nextDue: 'asc' } },
      photos: { orderBy: { takenAt: 'desc' }, take: 6 },
    },
  })
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data: vehicle })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const parsed = vehicleUpdateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  try {
    const vehicle = await prisma.vehicle.update({ where: { id }, data: parsed.data })
    return NextResponse.json({ data: vehicle })
  } catch {
    return NextResponse.json({ error: 'Vehicle not found or update failed' }, { status: 404 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  // Soft-delete (CR-8): never hard-delete a vehicle with check/maintenance
  // history — set the tombstone so reads hide it but history is preserved.
  await prisma.vehicle.update({ where: { id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ ok: true })
}
