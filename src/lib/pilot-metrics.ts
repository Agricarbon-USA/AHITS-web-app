import { prisma } from '@/lib/prisma'
import { businessDate } from '@/lib/business-date'

// CC-14: the Pilot Charter metric 1 denominator — "adoption = eligible daily checks /
// deployments actually done in-app." Pure read-side over rigs / rig_vehicles /
// daily_checks (zero capture); the charter requires this exist day 1. "Eligible" = the
// vehicles currently on an active (non-ended) deployment that should get a daily check;
// "done" = how many of those were checked on the business date. Also surfaces the
// average time-to-complete (the CC-14 durationMs column) as the "how long does a check
// take" pilot read.

export interface DailyCheckAdoption {
  date: string
  deployments: number
  eligibleVehicles: number
  checkedVehicles: number
  adoptionRate: number | null // done / eligible, null when nothing is eligible
  avgDurationMs: number | null
  durationSampleSize: number
}

export async function getDailyCheckAdoption(day: string = businessDate()): Promise<DailyCheckAdoption> {
  const date = new Date(day)

  const [eligibleRow, deploymentRow, doneRow, durationRow] = await Promise.all([
    // Distinct vehicles on an active deployment — the eligible-checks denominator.
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(DISTINCT rv."vehicleId")::int AS n
      FROM "rig_vehicles" rv
      JOIN "rigs" r ON r."id" = rv."rigId"
      WHERE r."endedAt" IS NULL AND rv."removedAt" IS NULL`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM "rigs" WHERE "endedAt" IS NULL`,
    // Of the eligible vehicles, how many were checked on the business date.
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(DISTINCT dc."vehicleId")::int AS n
      FROM "daily_checks" dc
      WHERE dc."date" = ${date}::date
        AND dc."vehicleId" IN (
          SELECT DISTINCT rv."vehicleId"
          FROM "rig_vehicles" rv
          JOIN "rigs" r ON r."id" = rv."rigId"
          WHERE r."endedAt" IS NULL AND rv."removedAt" IS NULL
        )`,
    prisma.$queryRaw<{ avg: number | null; n: number }[]>`
      SELECT AVG("durationMs")::int AS avg, COUNT("durationMs")::int AS n
      FROM "daily_checks"
      WHERE "date" = ${date}::date AND "durationMs" IS NOT NULL`,
  ])

  const eligibleVehicles = eligibleRow[0]?.n ?? 0
  const checkedVehicles = doneRow[0]?.n ?? 0

  return {
    date: day,
    deployments: deploymentRow[0]?.n ?? 0,
    eligibleVehicles,
    checkedVehicles,
    adoptionRate: eligibleVehicles > 0 ? checkedVehicles / eligibleVehicles : null,
    avgDurationMs: durationRow[0]?.avg ?? null,
    durationSampleSize: durationRow[0]?.n ?? 0,
  }
}
