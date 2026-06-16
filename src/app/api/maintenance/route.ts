import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')
  const vehicleId = searchParams.get('vehicleId')

  const tasks = await prisma.maintenanceTask.findMany({
    where: {
      ...(status && { status: status as never }),
      ...(vehicleId && { vehicleId }),
    },
    orderBy: [{ status: 'asc' }, { nextDue: 'asc' }],
    include: {
      vehicle: { select: { id: true, name: true } },
      item: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json({ data: tasks })
}

const createSchema = z.object({
  vehicleId: z.string().optional(),
  itemId: z.string().optional(),
  taskName: z.string().min(1),
  intervalType: z.enum(['MILEAGE', 'DAYS', 'MONTHS', 'PER_DEPLOYMENT']),
  intervalValue: z.number().int().min(1),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  nextDue: z.string().datetime().optional(),
  nextOdometer: z.number().int().optional(),
  estimatedCost: z.number().optional(),
  notes: z.string().optional(),
})

export async function POST(req: NextRequest) {
  // Both admins and operators can create maintenance tasks
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const task = await prisma.maintenanceTask.create({
    data: {
      ...parsed.data,
      nextDue: parsed.data.nextDue ? new Date(parsed.data.nextDue) : undefined,
    } as never,
  })
  return NextResponse.json({ data: task }, { status: 201 })
}
