import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')
  const type = searchParams.get('type')

  const vehicles = await prisma.vehicle.findMany({
    where: {
      ...(status && { status: status as never }),
      ...(type && { type: type as never }),
    },
    orderBy: { name: 'asc' },
    include: { _count: { select: { dailyChecks: true, maintenanceTasks: true } } },
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
  isRental: z.boolean().optional().default(false),
  rentalMake: z.string().optional(),
  rentalModel: z.string().optional(),
  rentalYear: z.number().int().optional(),
  rentalLength: z.string().optional(),
  rentalAgreementUrl: z.string().url().optional(),
  rentalPickupLocation: z.string().optional(),
  rentalDropoffLocation: z.string().optional(),
})

const OPERATOR_ALLOWED_VEHICLE_TYPES = ['TRAILER', 'POLARIS_UTV', 'CAN_AM_UTV']

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // Operators can create any type when it's a rental; non-rental is restricted to trailers/UTVs
  if (session.role !== 'ADMIN' && !parsed.data.isRental && !OPERATOR_ALLOWED_VEHICLE_TYPES.includes(parsed.data.type)) {
    return NextResponse.json({ error: 'Operators may only add trailers and UTVs' }, { status: 403 })
  }

  const vehicle = await prisma.vehicle.create({ data: parsed.data as never })
  return NextResponse.json({ data: vehicle }, { status: 201 })
}
