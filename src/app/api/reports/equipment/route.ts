import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'

// ── Equipment Cost & Utilization report (E-R) ──────────────────────────────
// The scoreboard for the PRD §7 "25% repair-spend reduction" metric. One row
// per tracked asset (vehicles + serialized inventory units) over a date window:
//   deployments      — times the asset was assigned to a rig/kit in the window
//   daysDeployed     — total in-use days within the window
//   utilizationPct   — daysDeployed / windowDays
//   maintenanceEvents/maintenanceSpend — count + sum(actualCost) of tasks
//   downtimeDays     — days a damage/repair task held the asset out of service
//
// Read-only aggregation; admin-only. `?format=csv` streams a CSV download.

const MS_PER_DAY = 86_400_000

function overlapDays(start: Date, end: Date, from: Date, to: Date): number {
  const s = Math.max(start.getTime(), from.getTime())
  const e = Math.min(end.getTime(), to.getTime())
  return e > s ? (e - s) / MS_PER_DAY : 0
}

function dec(d: { toString(): string } | null | undefined): number {
  if (d == null) return 0
  const n = Number(d.toString())
  return Number.isFinite(n) ? n : 0
}

function round(n: number, places = 1): number {
  const f = 10 ** places
  return Math.round(n * f) / f
}

interface ReportRow {
  assetType: 'VEHICLE' | 'UNIT'
  id: string
  name: string
  identifier: string | null
  kind: string
  status: string
  deployments: number
  daysDeployed: number
  utilizationPct: number
  maintenanceEvents: number
  maintenanceSpend: number
  downtimeDays: number
  // NEW-5: rental cost analysis (vehicles only; units are never rentals).
  isRental: boolean
  rentalCompany: string | null
  rentalCostBasis: string | null
  rentalCost: number
}

type RentalPeriod = 'DAY' | 'WEEK' | 'MONTH' | 'FLAT'

function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Human-readable cost basis, e.g. "$1,200.00 / week" or "$500.00 flat". */
function rentalBasisLabel(amount: number, period: RentalPeriod): string {
  return period === 'FLAT' ? `${money(amount)} flat` : `${money(amount)} / ${period.toLowerCase()}`
}

/**
 * Rental cost accrued within the report window = rate × duration.
 * Duration uses the rental contract dates when present, else falls back to the
 * asset's deployed days in the window. FLAT is a one-time fee counted when the
 * rental's span (or any deployment) falls in the window.
 */
function rentalCostInWindow(
  v: { isRental: boolean; rentalCostAmount: { toString(): string } | null; rentalCostPeriod: string | null; rentalStartDate: Date | null; rentalEndDate: Date | null },
  from: Date, to: Date, fallbackDays: number,
): number {
  if (!v.isRental || v.rentalCostAmount == null || !v.rentalCostPeriod) return 0
  const amount = dec(v.rentalCostAmount)
  const period = v.rentalCostPeriod as RentalPeriod
  const hasDates = v.rentalStartDate != null && v.rentalEndDate != null
  if (period === 'FLAT') {
    if (hasDates) return overlapDays(v.rentalStartDate as Date, v.rentalEndDate as Date, from, to) > 0 ? amount : 0
    return fallbackDays > 0 ? amount : 0
  }
  const days = hasDates ? overlapDays(v.rentalStartDate as Date, v.rentalEndDate as Date, from, to) : fallbackDays
  const perDay = period === 'DAY' ? amount : period === 'WEEK' ? amount / 7 : amount / 30
  return perDay * days
}

function maintInWindow(t: { createdAt: Date; completedAt: Date | null }, from: Date, to: Date): boolean {
  return t.createdAt.getTime() <= to.getTime() && (t.completedAt == null || t.completedAt.getTime() >= from.getTime())
}

function csvCell(v: string | number | null): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const toParam = searchParams.get('to')
  const fromParam = searchParams.get('from')
  const to = toParam ? new Date(toParam) : now
  // Default window: trailing 180 days (≈ the PRD's 6-month repair-spend horizon).
  const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 180 * MS_PER_DAY)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }
  const windowDays = (to.getTime() - from.getTime()) / MS_PER_DAY

  const [vehicles, units] = await Promise.all([
    prisma.vehicle.findMany({
      include: {
        rigVehicles: { select: { addedAt: true, removedAt: true } },
        maintenanceTasks: { select: { createdAt: true, completedAt: true, actualCost: true, isDamageReport: true, status: true } },
      },
    }),
    prisma.inventoryUnit.findMany({
      where: { deletedAt: null },
      include: {
        inventoryItem: { select: { name: true, category: true } },
        kitItems: { select: { addedAt: true, removedAt: true } },
        maintenanceTasks: { select: { createdAt: true, completedAt: true, actualCost: true, isDamageReport: true, status: true } },
      },
    }),
  ])

  const rows: ReportRow[] = []

  for (const v of vehicles) {
    const assignments = v.rigVehicles.filter((rv) => overlapDays(rv.addedAt, rv.removedAt ?? now, from, to) > 0)
    const daysDeployed = assignments.reduce((sum, rv) => sum + overlapDays(rv.addedAt, rv.removedAt ?? now, from, to), 0)
    const tasks = v.maintenanceTasks.filter((t) => maintInWindow(t, from, to))
    const maintenanceSpend = tasks.reduce((sum, t) => sum + dec(t.actualCost), 0)
    const downtimeDays = tasks
      .filter((t) => t.isDamageReport || t.status === 'IN_PROGRESS' || t.status === 'OVERDUE')
      .reduce((sum, t) => sum + overlapDays(t.createdAt, t.completedAt ?? now, from, to), 0)
    const rentalCost = rentalCostInWindow(v, from, to, daysDeployed)
    rows.push({
      assetType: 'VEHICLE',
      id: v.id,
      name: v.name,
      identifier: v.licensePlate ?? v.vin ?? null,
      kind: v.type,
      status: v.status,
      deployments: assignments.length,
      daysDeployed: round(daysDeployed),
      utilizationPct: round((daysDeployed / windowDays) * 100),
      maintenanceEvents: tasks.length,
      maintenanceSpend: round(maintenanceSpend, 2),
      downtimeDays: round(downtimeDays),
      isRental: v.isRental,
      rentalCompany: v.rentalCompany ?? null,
      rentalCostBasis: v.isRental && v.rentalCostAmount != null && v.rentalCostPeriod
        ? rentalBasisLabel(dec(v.rentalCostAmount), v.rentalCostPeriod as RentalPeriod)
        : null,
      rentalCost: round(rentalCost, 2),
    })
  }

  for (const u of units) {
    const assignments = u.kitItems.filter((ki) => overlapDays(ki.addedAt, ki.removedAt ?? now, from, to) > 0)
    const daysDeployed = assignments.reduce((sum, ki) => sum + overlapDays(ki.addedAt, ki.removedAt ?? now, from, to), 0)
    const tasks = u.maintenanceTasks.filter((t) => maintInWindow(t, from, to))
    const maintenanceSpend = tasks.reduce((sum, t) => sum + dec(t.actualCost), 0)
    const downtimeDays = tasks
      .filter((t) => t.isDamageReport || t.status === 'IN_PROGRESS' || t.status === 'OVERDUE')
      .reduce((sum, t) => sum + overlapDays(t.createdAt, t.completedAt ?? now, from, to), 0)
    rows.push({
      assetType: 'UNIT',
      id: u.id,
      name: u.inventoryItem.name,
      identifier: u.serialNumber ?? u.qrCodeId.slice(0, 8),
      kind: u.inventoryItem.category,
      status: u.status,
      deployments: assignments.length,
      daysDeployed: round(daysDeployed),
      utilizationPct: round((daysDeployed / windowDays) * 100),
      maintenanceEvents: tasks.length,
      maintenanceSpend: round(maintenanceSpend, 2),
      downtimeDays: round(downtimeDays),
      isRental: false,
      rentalCompany: null,
      rentalCostBasis: null,
      rentalCost: 0,
    })
  }

  // Default ordering: biggest maintenance spend first (the headline signal).
  rows.sort((a, b) => b.maintenanceSpend - a.maintenanceSpend || b.utilizationPct - a.utilizationPct)

  const summary = {
    windowDays: round(windowDays),
    from: from.toISOString(),
    to: to.toISOString(),
    assetCount: rows.length,
    totalMaintenanceSpend: round(rows.reduce((s, r) => s + r.maintenanceSpend, 0), 2),
    totalMaintenanceEvents: rows.reduce((s, r) => s + r.maintenanceEvents, 0),
    avgUtilizationPct: rows.length ? round(rows.reduce((s, r) => s + r.utilizationPct, 0) / rows.length) : 0,
    totalDowntimeDays: round(rows.reduce((s, r) => s + r.downtimeDays, 0)),
    rentalCount: rows.filter((r) => r.isRental).length,
    totalRentalCost: round(rows.reduce((s, r) => s + r.rentalCost, 0), 2),
  }

  if (searchParams.get('format') === 'csv') {
    const headers = ['Asset Type', 'Name', 'Identifier', 'Kind', 'Status', 'Deployments', 'Days Deployed', 'Utilization %', 'Maintenance Events', 'Maintenance Spend', 'Downtime Days', 'Rental', 'Rental Company', 'Rental Cost Basis', 'Rental Cost (window)']
    const lines = [headers.join(',')]
    for (const r of rows) {
      lines.push([
        r.assetType, r.name, r.identifier, r.kind, r.status, r.deployments,
        r.daysDeployed, r.utilizationPct, r.maintenanceEvents, r.maintenanceSpend, r.downtimeDays,
        r.isRental ? 'Yes' : 'No', r.rentalCompany, r.rentalCostBasis, r.isRental ? r.rentalCost : '',
      ].map(csvCell).join(','))
    }
    const csv = lines.join('\n')
    const stamp = to.toISOString().slice(0, 10)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="equipment-cost-utilization-${stamp}.csv"`,
      },
    })
  }

  return NextResponse.json({ data: { summary, rows } })
}
