import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireAdmin } from '@/lib/auth/session'
import { createAlert } from '@/lib/alerts'
import { money } from '@/lib/validation'

export async function GET(req: NextRequest) {
  const session = await requireAuth()
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
      unit: { select: { id: true, qrCodeId: true, serialNumber: true, status: true } },
      repairHub: { select: { id: true, name: true } },
      hub: { select: { id: true, name: true } },
      photos: { select: { id: true, url: true, takenAt: true }, orderBy: { takenAt: 'desc' } },
    },
  })

  // Fire-and-forget: create alerts for overdue tasks
  const now = new Date()
  for (const task of tasks) {
    if (task.status === 'OVERDUE' && task.nextDue && task.nextDue < now) {
      createAlert('MAINTENANCE_OVERDUE', 'maintenance_tasks', task.id, {
        taskName: task.taskName,
        itemId: task.itemId ?? null,
        daysPastDue: Math.floor((now.getTime() - task.nextDue.getTime()) / 86400000),
      }).catch(() => {})
    }
  }

  // Cost/spend data is admin-only (§10.2). Strip cost fields for operators.
  const data = session.role === 'ADMIN'
    ? tasks
    : tasks.map(({ estimatedCost, actualCost, ...rest }) => {
        void estimatedCost
        void actualCost
        return rest
      })

  return NextResponse.json({ data })
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
  estimatedCost: money().optional(),
  notes: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
