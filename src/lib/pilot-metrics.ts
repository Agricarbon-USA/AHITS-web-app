import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { appTimezone, businessDate } from '@/lib/business-date'
import { getDeploymentRostersForDisplay } from '@/lib/deployment-assignments'

// CC-14 / CC-31: the Pilot Charter read-side. Metric 1 = daily-check adoption
// (eligible checks / deployments); metric 2 = time-to-complete; CC-31 adds the GPS
// grant rate, a durationMs distribution, a per-day checks list (drill-down), and a
// per-rig operator+vehicle breakdown — the surface Max's daily 5-minute watch reads.
// Pure read-side (zero capture). Admin-only via the route's requireAdmin.
//
// DENOMINATOR HONESTY (CC-31 item 6b): eligibility is SNAPSHOTTED per queried day, not
// computed from rigs active NOW — otherwise history shifts retroactively every time a
// deployment ends. A day's eligible set = rigs whose window overlaps that APP_TIMEZONE
// day, and the rig_vehicles rows attached during it (FND-7 boundaries, same discipline
// the cron uses).

const FAST_CHECK_MS = 20_000 // < 20s → "worth a look" (the charter's pencil-whip signal)
const MAX_RANGE_DAYS = 60

export interface PilotCheckRow {
  id: string
  operatorName: string | null
  vehicleName: string | null
  submittedAt: Date
  durationMs: number | null
  passFail: boolean
  hasGps: boolean
}

export interface DurationBuckets {
  under20s: number
  under1m: number
  under3m: number
  under10m: number
  over10m: number
}

export interface PilotDay {
  date: string
  deployments: number
  eligibleVehicles: number
  checkedVehicles: number
  adoptionRate: number | null // done / eligible, null when nothing is eligible
  avgDurationMs: number | null
  durationSampleSize: number
  durationBuckets: DurationBuckets
  gpsGrantRate: number | null // fraction of the day's checks with a GPS fix, null if 0 checks
  gpsSampleSize: number
  flaggedFastCount: number // checks under FAST_CHECK_MS
  checks: PilotCheckRow[]
}

export interface BreakdownVehicle {
  vehicleId: string
  name: string | null
  checked: boolean
}

export interface BreakdownRig {
  rigId: string
  operatorName: string | null
  isAdminHeld: boolean // D3: admin-held rigs are excluded from payroll attribution; flag distinctly
  projectName: string | null
  vehicles: BreakdownVehicle[]
  checkedCount: number
  eligibleCount: number
}

export interface PilotMetrics {
  from: string
  to: string
  days: PilotDay[]
  breakdown: { day: string; rigs: BreakdownRig[] }
}

// Reusable SQL fragments for the APP_TIMEZONE day boundaries of `day` (YYYY-MM-DD).
// end is exclusive (start of the next day). AT TIME ZONE turns the naive local midnight
// into the correct UTC instant to compare against the timestamptz columns.
function startOfDay(day: string, tz: string) {
  return Prisma.sql`(${day}::date::timestamp AT TIME ZONE ${tz})`
}
function endOfDay(day: string, tz: string) {
  return Prisma.sql`((${day}::date + INTERVAL '1 day')::timestamp AT TIME ZONE ${tz})`
}

/** rig_vehicles rows eligible on `day` (snapshot): a vehicle on a rig whose window
 *  overlaps the day. Shared by the eligible count and the checked-of-eligible count. */
function eligibleVehicleIdsSql(day: string, tz: string) {
  return Prisma.sql`
    SELECT DISTINCT rv."vehicleId"
    FROM "rig_vehicles" rv
    JOIN "rigs" r ON r."id" = rv."rigId"
    WHERE rv."addedAt" < ${endOfDay(day, tz)}
      AND (rv."removedAt" IS NULL OR rv."removedAt" >= ${startOfDay(day, tz)})
      AND r."startedAt" < ${endOfDay(day, tz)}
      AND (r."endedAt" IS NULL OR r."endedAt" >= ${startOfDay(day, tz)})`
}

function emptyBuckets(): DurationBuckets {
  return { under20s: 0, under1m: 0, under3m: 0, under10m: 0, over10m: 0 }
}

async function getDayMetrics(day: string): Promise<PilotDay> {
  const tz = appTimezone()
  const [eligibleRow, deploymentRow, doneRow, checkRows] = await Promise.all([
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM (${eligibleVehicleIdsSql(day, tz)}) e`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM "rigs" r
      WHERE r."startedAt" < ${endOfDay(day, tz)}
        AND (r."endedAt" IS NULL OR r."endedAt" >= ${startOfDay(day, tz)})`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(DISTINCT dc."vehicleId")::int AS n
      FROM "daily_checks" dc
      WHERE dc."date" = ${day}::date
        AND dc."vehicleId" IN (${eligibleVehicleIdsSql(day, tz)})`,
    prisma.$queryRaw<PilotCheckRow[]>`
      SELECT dc."id", u."name" AS "operatorName", v."name" AS "vehicleName",
             dc."submittedAt", dc."durationMs", dc."passFail",
             (dc."gpsLat" IS NOT NULL) AS "hasGps"
      FROM "daily_checks" dc
      LEFT JOIN "users" u ON u."id" = dc."operatorId"
      LEFT JOIN "vehicles" v ON v."id" = dc."vehicleId"
      WHERE dc."date" = ${day}::date
      ORDER BY dc."submittedAt" DESC NULLS LAST`,
  ])

  const eligibleVehicles = eligibleRow[0]?.n ?? 0
  const checkedVehicles = doneRow[0]?.n ?? 0
  const checks = checkRows

  // Duration distribution + average, from the timed subset only.
  const buckets = emptyBuckets()
  let durationSum = 0
  let durationSampleSize = 0
  let flaggedFastCount = 0
  for (const c of checks) {
    if (c.durationMs == null) continue
    durationSum += c.durationMs
    durationSampleSize++
    if (c.durationMs < FAST_CHECK_MS) { buckets.under20s++; flaggedFastCount++ }
    else if (c.durationMs < 60_000) buckets.under1m++
    else if (c.durationMs < 180_000) buckets.under3m++
    else if (c.durationMs < 600_000) buckets.under10m++
    else buckets.over10m++
  }

  const gpsSampleSize = checks.length
  const gpsWithFix = checks.filter((c) => c.hasGps).length

  return {
    date: day,
    deployments: deploymentRow[0]?.n ?? 0,
    eligibleVehicles,
    checkedVehicles,
    adoptionRate: eligibleVehicles > 0 ? checkedVehicles / eligibleVehicles : null,
    avgDurationMs: durationSampleSize > 0 ? Math.round(durationSum / durationSampleSize) : null,
    durationSampleSize,
    durationBuckets: buckets,
    gpsGrantRate: gpsSampleSize > 0 ? gpsWithFix / gpsSampleSize : null,
    gpsSampleSize,
    flaggedFastCount,
    checks,
  }
}

/** The per-rig operator+vehicle grid for one day: each rig active that day, its PRIMARY
 *  operator (same resolver the cron uses, D3 isAdminHeld flag), and which of its vehicles
 *  were checked. Rosters are current-state (the assignment table) — accurate for rigs
 *  still active; a since-ended rig may resolve no primary (accepted for the pilot window). */
async function getDayBreakdown(day: string): Promise<BreakdownRig[]> {
  const tz = appTimezone()
  const rigs = await prisma.$queryRaw<{ id: string; projectName: string | null }[]>`
    SELECT r."id", p."name" AS "projectName"
    FROM "rigs" r
    LEFT JOIN "projects" p ON p."id" = r."projectId"
    WHERE r."startedAt" < ${endOfDay(day, tz)}
      AND (r."endedAt" IS NULL OR r."endedAt" >= ${startOfDay(day, tz)})
    ORDER BY r."startedAt" DESC`
  if (rigs.length === 0) return []

  const rosters = await getDeploymentRostersForDisplay(rigs.map((r) => r.id))
  const vehRows = await prisma.$queryRaw<{ rigId: string; vehicleId: string; vehicleName: string | null; checked: boolean }[]>`
    SELECT rv."rigId", rv."vehicleId", v."name" AS "vehicleName",
           EXISTS (
             SELECT 1 FROM "daily_checks" dc
             WHERE dc."vehicleId" = rv."vehicleId" AND dc."date" = ${day}::date
           ) AS "checked"
    FROM "rig_vehicles" rv
    JOIN "vehicles" v ON v."id" = rv."vehicleId"
    WHERE rv."rigId" IN (${Prisma.join(rigs.map((r) => r.id))})
      AND rv."addedAt" < ${endOfDay(day, tz)}
      AND (rv."removedAt" IS NULL OR rv."removedAt" >= ${startOfDay(day, tz)})
    ORDER BY v."name" ASC`

  const vehiclesByRig = new Map<string, BreakdownVehicle[]>()
  for (const r of vehRows) {
    const list = vehiclesByRig.get(r.rigId) ?? []
    list.push({ vehicleId: r.vehicleId, name: r.vehicleName, checked: r.checked })
    vehiclesByRig.set(r.rigId, list)
  }

  return rigs.map((rig) => {
    const roster = rosters.get(rig.id)
    const vehicles = vehiclesByRig.get(rig.id) ?? []
    return {
      rigId: rig.id,
      operatorName: roster?.operator?.name ?? null,
      isAdminHeld: roster?.operator?.role === 'ADMIN',
      projectName: rig.projectName,
      vehicles,
      checkedCount: vehicles.filter((v) => v.checked).length,
      eligibleCount: vehicles.length,
    }
  })
}

/** Inclusive list of YYYY-MM-DD strings from `from` to `to`, capped. Enumerated at UTC
 *  midnight (date-only, DST-agnostic) purely to step days; the queries apply the tz. */
function enumerateDays(from: string, to: string): string[] {
  const out: string[] = []
  const start = new Date(`${from}T00:00:00Z`).getTime()
  const end = new Date(`${to}T00:00:00Z`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return []
  for (let t = start; t <= end && out.length < MAX_RANGE_DAYS; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

/**
 * The pilot dashboard payload for a date range (default: the pilot fortnight to date).
 * Per-day summaries + the most-recent day's per-rig breakdown for the drill-down.
 */
export async function getPilotMetrics(from?: string, to?: string): Promise<PilotMetrics> {
  const today = businessDate()
  const end = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : today
  // Default window: the trailing 14 days ending at `end` (the pilot fortnight to date).
  const defaultFrom = businessDate(new Date(new Date(`${end}T00:00:00Z`).getTime() - 13 * 86_400_000))
  const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : defaultFrom

  const days = enumerateDays(start, end)
  const [dayMetrics, breakdownRigs] = await Promise.all([
    Promise.all(days.map((d) => getDayMetrics(d))),
    getDayBreakdown(end),
  ])

  return { from: start, to: end, days: dayMetrics, breakdown: { day: end, rigs: breakdownRigs } }
}

// ── Backward-compatible single-day adoption (CC-14) ────────────────────────────
// Kept for the original metric-1 shape; eligibility now SNAPSHOTS per day (CC-31 6b),
// so a historical query no longer shifts as later deployments end.

export interface DailyCheckAdoption {
  date: string
  deployments: number
  eligibleVehicles: number
  checkedVehicles: number
  adoptionRate: number | null
  avgDurationMs: number | null
  durationSampleSize: number
}

export async function getDailyCheckAdoption(day: string = businessDate()): Promise<DailyCheckAdoption> {
  const d = await getDayMetrics(day)
  return {
    date: d.date,
    deployments: d.deployments,
    eligibleVehicles: d.eligibleVehicles,
    checkedVehicles: d.checkedVehicles,
    adoptionRate: d.adoptionRate,
    avgDurationMs: d.avgDurationMs,
    durationSampleSize: d.durationSampleSize,
  }
}
