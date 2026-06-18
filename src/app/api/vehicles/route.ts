import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireAdmin } from '@/lib/auth/session'

// Fields an OPERATOR may see (SEC-2). Excludes VIN, license plate, insurance /
// registration expiry, and free-form notes — PII/admin data operators don't
// need for field work. Admins receive the full row.
const OPERATOR_VEHICLE_SELECT = {
  id: true,
  name: true,
  type: true,
  status: true,
  makeModel: true,
  year: true,
  odometer: true,
  location: true,
  qrCodeId: true,
  assignedOperatorId: true,
  createdAt: true,
  updatedAt: true,
} as const

export async function GET(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')
  const type = searchParams.get('type')
  const isAdmin = session.role === 'ADMIN'

  const where = {
    ...(status && { status: status as never }),
    ...(type && { type: type as never }),
  }
  const _count = { select: { dailyChecks: true, maintenanceTasks: true } }

  // Separate calls so each gets a concrete arg type (TS can't infer a unified
  // include-vs-select shape from a conditional spread).
  const vehicles = isAdmin
    ? await prisma.vehicle.findMany({ where, orderBy: { name: 'asc' }, include: { _count } })
    : await prisma.vehicle.findMany({
        where,
        orderBy: { name: 'asc' },
        select: { ...OPERATOR_VEHICLE_SELECT, _count },
      })
  return NextResponse.json({ data: vehicles })
}

const createSchema = z.object({
  name: z.string().min(1),
  type: z.string(),
  year: z.number().int().optional(),
  makeModel: z.string().optional(),
  vin: z.string().optional(),
  licensePlate: z.string().optional(),
  odometer: z.number().int().optional(),
  location: z.string().optional(),
  insuranceExpires: z.string().datetime().optional(),
  registrationExpires: z.string().datetime().optional(),
  notes: z.string().optional(),
  // QR association-on-create (PRD §7.7): register the existing physical label's
  // code as this vehicle's QR id. Omit to auto-generate one.
  qrCodeId: z.string().trim().min(1).optional(),
})

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const vehicle = await prisma.vehicle.create({ data: parsed.data as never })
    return NextResponse.json({ data: vehicle }, { status: 201 })
  } catch (err: unknown) {
    // Unique violation (name / VIN / qrCodeId already in use).
    if ((err as { code?: string }).code === 'P2002') {
      const target = (err as { meta?: { target?: string[] } }).meta?.target?.join(', ') ?? 'field'
      const msg = target.includes('qrCodeId')
        ? 'That QR label is already assigned to another vehicle.'
        : `A vehicle with the same ${target} already exists.`
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    const msg = err instanceof Error ? err.message : 'Failed to create vehicle'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
