import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { businessDate } from '@/lib/business-date'
import { requireAuth } from '@/lib/auth/session'

// Operational feeds for the dashboard (alert-response KPI): the things to act on
// today, not just the headline counts. Read-only. Readable by any authenticated
// user so operators get org-wide read-only visibility (workplan §6); all the
// actions these feeds deep-link to remain admin-gated at their own routes.

const MS_PER_DAY = 86_400_000
const DUE_SOON_DAYS = 14
const LONG_RUNNING_DAYS = 30
const SPEND_WINDOW_DAYS = 90 // M5-27: proactive maintenance-spend nudge window
const SPEND_WATCH_LIMIT = 5

function dec(d: { toString(): string } | null | undefined): number {
  if (d == null) return 0
  const n = Number(d.toString())
  return Number.isFinite(n) ? n : 0
}

export async function GET() {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  // FND-7: "today" is the APP_TIMEZONE business date (matches the cron + client),
  // not the server's UTC midnight.
  const businessToday = new Date(businessDate(now))
  const dueSoonCutoff = new Date(now.getTime() + DUE_SOON_DAYS * MS_PER_DAY)
  const longRunningCutoff = new Date(now.getTime() - LONG_RUNNING_DAYS * MS_PER_DAY)
  const spendWindowStart = new Date(now.getTime() - SPEND_WINDOW_DAYS * MS_PER_DAY)

  const [activeRigs, checksToday, dueTasks, longRigs, recentLogs, recentSpend] = await Promise.all([
    prisma.rig.findMany({
      where: { endedAt: null },
      select: { id: true, label: true, startedAt: true, operatorId: true, operator: { select: { name: true } } },
    }),
    prisma.dailyCheck.findMany({ where: { date: businessToday }, select: { operatorId: true } }),
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
    // M5-27: maintenance spend in the trailing window, per asset. Completed tasks
    // with a recorded actualCost; aggregated in JS so vehicles + inventory items
    // share one ranking.
    prisma.maintenanceTask.findMany({
      where: {
        deletedAt: null,
        actualCost: { not: null },
        completedAt: { gte: spendWindowStart },
      },
      select: {
        actualCost: true,
        vehicleId: true,
        itemId: true,
        vehicle: { select: { id: true, name: true } },
        item: { select: { id: true, name: true } },
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

  // M5-27: rank assets by trailing-window maintenance spend (proactive nudge —
  // "this asset is becoming expensive"). Keyed by asset so a vehicle and an item
  // never collide; the top spenders surface on the dashboard.
  const spendByAsset = new Map<string, { name: string; href: string; spend: number; events: number }>()
  for (const t of recentSpend) {
    const key = t.vehicleId ? `v:${t.vehicleId}` : t.itemId ? `i:${t.itemId}` : null
    if (!key) continue
    const name = t.vehicle?.name ?? t.item?.name ?? 'Asset'
    const href = t.vehicleId ? `/admin/vehicles?vehicle=${t.vehicleId}` : '/admin/maintenance'
    const entry = spendByAsset.get(key) ?? { name, href, spend: 0, events: 0 }
    entry.spend += dec(t.actualCost)
    entry.events += 1
    spendByAsset.set(key, entry)
  }
  const maintenanceWatch = [...spendByAsset.values()]
    .filter((e) => e.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, SPEND_WATCH_LIMIT)
    .map((e) => ({ name: e.name, href: e.href, spend: Math.round(e.spend * 100) / 100, events: e.events, windowDays: SPEND_WINDOW_DAYS }))

  return NextResponse.json({
    data: {
      counts: {
        missedChecks: missedChecks.length,
        maintenanceDueSoon: maintenanceDueSoon.length,
        longRunning: longRunning.length,
        maintenanceWatch: maintenanceWatch.length,
      },
      missedChecks,
      maintenanceDueSoon,
      longRunning,
      recentActivity,
      maintenanceWatch,
    },
  })
}
