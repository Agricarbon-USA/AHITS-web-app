import dayjs from 'dayjs'
import { prisma } from '@/lib/prisma'
import { createAlert } from '@/lib/alerts'

// ─────────────────────────────────────────────────────────────────────────
// Maintenance recurrence & mileage triggers (Wave G)
//
// Scheduled maintenance recurs IN PLACE on the same MaintenanceTask row: when
// completed, `lastCompleted` records the service and `nextDue` / `nextOdometer`
// roll forward by the interval. (Damage reports are one-off and terminate.)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Next due date for a time-based recurring task. MILEAGE / PER_DEPLOYMENT tasks
 * are not date-driven, so they return null (they roll forward on odometer or
 * deployment events instead).
 */
export function nextDueFromInterval(
  intervalType: string,
  intervalValue: number,
  from: Date,
): Date | null {
  if (intervalValue <= 0) return null
  if (intervalType === 'DAYS') return dayjs(from).add(intervalValue, 'day').toDate()
  if (intervalType === 'MONTHS') return dayjs(from).add(intervalValue, 'month').toDate()
  return null
}

// How many miles ahead of `nextOdometer` a mileage task flips to DUE_SOON.
export const DUE_SOON_MILES = 500

/**
 * Apply a daily-check odometer reading: record it on the vehicle and roll its
 * mileage-based maintenance tasks to DUE_SOON / OVERDUE (raising the usual
 * deduped alert), so mileage maintenance becomes proactive instead of relying
 * on someone remembering. Best-effort — never throws into the check submission.
 */
export async function applyOdometerReading(vehicleId: string, odometer: number): Promise<void> {
  try {
    // Only advance the recorded odometer (never roll it backwards on a typo).
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { odometer: true, name: true } })
    if (!vehicle) return
    if (vehicle.odometer == null || odometer > vehicle.odometer) {
      await prisma.vehicle.update({ where: { id: vehicleId }, data: { odometer } })
    }

    const tasks = await prisma.maintenanceTask.findMany({
      where: {
        vehicleId,
        intervalType: 'MILEAGE',
        isDamageReport: false,
        status: { in: ['UPCOMING', 'DUE_SOON'] },
        nextOdometer: { not: null },
      },
    })
    for (const t of tasks) {
      if (t.nextOdometer == null) continue
      if (odometer >= t.nextOdometer) {
        await prisma.maintenanceTask.update({ where: { id: t.id }, data: { status: 'OVERDUE' } })
        await createAlert('MAINTENANCE_OVERDUE', 'maintenance_tasks', t.id, {
          taskName: t.taskName,
          itemName: vehicle.name,
        })
      } else if (odometer >= t.nextOdometer - DUE_SOON_MILES && t.status === 'UPCOMING') {
        await prisma.maintenanceTask.update({ where: { id: t.id }, data: { status: 'DUE_SOON' } })
      }
    }
  } catch {
    /* trigger is advisory — a failure here must not fail the daily check */
  }
}
