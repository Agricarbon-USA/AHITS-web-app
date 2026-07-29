import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireAdmin } from '@/lib/auth/session'
import { money, parsePagination } from '@/lib/validation'
import { nextDueFromInterval } from '@/lib/maintenance'

export async function GET(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')
  const vehicleId = searchParams.get('vehicleId')
  // CC-34 (3d): open tasks for one deployment. PR-1b's scalar `rigId` makes this a
  // one-line filter — an operator whose gear went to repair can now see it on My
  // Deployment. Already operator-readable (costs stripped below), so no auth change.
  const rigId = searchParams.get('rigId')
  const { pageSize, skip } = parsePagination(searchParams)

  const tasks = await prisma.maintenanceTask.findMany({
    where: {
      deletedAt: null,
      ...(status && { status: status as never }),
      ...(vehicleId && { vehicleId }),
      ...(rigId && { rigId }),
    },
    orderBy: [{ status: 'asc' }, { nextDue: 'asc' }],
    take: pageSize,
    skip,
    include: {
      vehicle: { select: { id: true, name: true } },
      item: { select: { id: true, name: true } },
      unit: { select: { id: true, qrCodeId: true, serialNumber: true, status: true } },
      repairHub: { select: { id: true, name: true } },
      hub: { select: { id: true, name: true } },
      photos: { select: { id: true, url: true, takenAt: true }, orderBy: { takenAt: 'desc' } },
    },
  })

  // NOTE: overdue-alert creation lives in the cron dispatcher (a GET must not write).

  // CC-34 (1b): rigId/reportedById are scalar FKs (no @relation, house pattern), so
  // resolve their labels with two batched lookups and attach rig/reportedBy to each task.
  const rigIds = [...new Set(tasks.map((t) => t.rigId).filter((v): v is string => !!v))]
  const reporterIds = [...new Set(tasks.map((t) => t.reportedById).filter((v): v is string => !!v))]
  const [rigs, reporters] = await Promise.all([
    rigIds.length
      ? prisma.rig.findMany({ where: { id: { in: rigIds } }, select: { id: true, label: true } })
      : Promise.resolve([]),
    reporterIds.length
      ? prisma.user.findMany({ where: { id: { in: reporterIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ])
  const rigById = new Map(rigs.map((r) => [r.id, r]))
  const reporterById = new Map(reporters.map((u) => [u.id, u]))
  const withReported = tasks.map((t) => ({
    ...t,
    rig: t.rigId ? rigById.get(t.rigId) ?? null : null,
    reportedBy: t.reportedById ? reporterById.get(t.reportedById) ?? null : null,
  }))

  // Cost/spend data is admin-only (§10.2). Strip cost fields for operators.
  const data = session.role === 'ADMIN'
    ? withReported
    : withReported.map(({ estimatedCost, actualCost, ...rest }) => {
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
  const input = parsed.data
  const now = new Date()

  // CC-34 (3a): a schedulable task must never be born unschedulable. A DAYS/MONTHS task
  // with no explicit first-due date would never trip the calendar overdue scan (it needs
  // nextDue < now, cron/dispatch:93), and a MILEAGE task with no nextOdometer would never
  // trip the odometer trigger. Default both from the interval so every created schedule is
  // live the moment it exists. (The UI omits PER_DEPLOYMENT — D29-4 — which is intentionally
  // left unscheduled here; its mechanics stay dormant.)
  let nextDue: Date | undefined = input.nextDue ? new Date(input.nextDue) : undefined
  if (!nextDue && (input.intervalType === 'DAYS' || input.intervalType === 'MONTHS')) {
    nextDue = nextDueFromInterval(input.intervalType, input.intervalValue, now) ?? undefined
  }

  let nextOdometer = input.nextOdometer
  if (nextOdometer == null && input.intervalType === 'MILEAGE' && input.vehicleId) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: input.vehicleId, deletedAt: null },
      select: { odometer: true },
    })
    if (vehicle?.odometer != null) nextOdometer = vehicle.odometer + input.intervalValue
  }

  const task = await prisma.maintenanceTask.create({
    data: { ...input, nextDue, nextOdometer } as never,
  })
  return NextResponse.json({ data: task }, { status: 201 })
}
