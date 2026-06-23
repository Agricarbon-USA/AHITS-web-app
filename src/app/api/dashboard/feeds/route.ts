import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'

// Operational feeds for the admin dashboard (alert-response KPI): the things an
// admin should act on today, not just the headline counts. Read-only, admin-only.

const MS_PER_DAY = 86_400_000
const DUE_SOON_DAYS = 14
const LONG_RUNNING_DAYS = 30

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const dueSoonCutoff = new Date(now.getTime() + DUE_SOON_DAYS * MS_PER_DAY)
  const longRunningCutoff = new Date(now.getTime() - LONG_RUNNING_DAYS * MS_PER_DAY)

  const [activeRigs, checksToday, dueTasks, longRigs, recentLogs] = await Promise.all([
    prisma.rig.findMany({
      where: { endedAt: null },
      select: { id: true, label: true, startedAt: true, operatorId: true, operator: { select: { name: true } } },
    }),
    prisma.dailyCheck.findMany({ where: { submittedAt: { gte: startOfToday } }, select: { operatorId: true } }),
    prisma.maintenanceTask.findMany({
      where: { status: { not: 'COMPLETED' }, nextDue: { not: null, lte: dueSoonCutoff } },
      orderBy: { nextDue: 'asc' },
      take: 15,
      include: {
        vehicle: { select: { name: true } },
        item: { select: { name: true } },
        unit: { select: { serialNumber: true } },
      },
    }),
    prisma.rig.findMany({
      where: { endedAt: null, startedAt: { lt: longRunningCutoff } },
      orderBy: { startedAt: 'asc' },
      take: 15,
      select: { id: true, label: true, startedAt: true, operator: { select: { name: true } } },
    }),
    prisma.checkLog.findMany({
      orderBy: { submittedAt: 'desc' },
      take: 10,
      include: {
        item: { select: { name: true } },
        operator: { select: { name: true } },
        inventoryUnit: { select: { serialNumber: true } },
      },
    }),
  ])

  const checkedToday = new Set(checksToday.map((c) => c.operatorId))
  const missedChecks = activeRigs
    .filter((r) => !checkedToday.has(r.operatorId))
    .map((r) => ({ rigId: r.id, operator: r.operator?.name ?? 'Unassigned', label: r.label, startedAt: r.startedAt }))

  const maintenanceDueSoon = dueTasks.map((t) => ({
    id: t.id,
    taskName: t.taskName,
    target: t.vehicle?.name ?? t.item?.name ?? (t.unit?.serialNumber ? `Unit ${t.unit.serialNumber}` : 'Asset'),
    nextDue: t.nextDue,
    status: t.status,
    overdue: t.nextDue ? t.nextDue.getTime() < now.getTime() : false,
  }))

  const longRunning = longRigs.map((r) => ({
    rigId: r.id,
    operator: r.operator?.name ?? 'Unassigned',
    label: r.label,
    startedAt: r.startedAt,
    daysOut: Math.floor((now.getTime() - r.startedAt.getTime()) / MS_PER_DAY),
  }))

  const recentActivity = recentLogs.map((l) => ({
    id: l.id,
    action: l.action,
    item: l.item?.name ?? 'Item',
    unit: l.inventoryUnit?.serialNumber ?? null,
    operator: l.operator?.name ?? null,
    at: l.submittedAt,
  }))

  return NextResponse.json({
    data: {
      counts: {
        missedChecks: missedChecks.length,
        maintenanceDueSoon: maintenanceDueSoon.length,
        longRunning: longRunning.length,
      },
      missedChecks,
      maintenanceDueSoon,
      longRunning,
      recentActivity,
    },
  })
}
