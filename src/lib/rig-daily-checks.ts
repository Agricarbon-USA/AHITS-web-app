import { prisma } from '@/lib/prisma'
import { appTimezone } from '@/lib/business-date'

// PR-5c (L-8, owner decision final 2026-10-09): a rig's daily checks are per rig per
// business day and shared by its crew. One definition of "checked for this rig today",
// used by three readers so they can never disagree:
//   - Today's done state (getOperatorToday) — every crew member sees the same list;
//   - the daily-check POST — a second crew check of the same vehicle that day is a 409;
//   - the DAILY_CHECK_MISSED evaluator — a crewmate's check covers the PRIMARY.
// "Crew" is anyone ever assigned to the rig (PRIMARY or SECONDARY, open or ended), so a
// check filed before a mid-day handoff still counts for the rig. Keyed on the rig the
// vehicle is on NOW, never on who is asking. Code only — no migration, no constraint.

type Db = Pick<typeof prisma, 'dailyCheck' | 'rigVehicle' | 'deploymentAssignment'>

export interface RigVehicleCheck {
  vehicleId: string
  checkId: string
  operatorId: string
  operatorName: string
  submittedAt: Date
}

/** The active rig a vehicle is on right now, or null. */
export async function getVehicleActiveRigId(vehicleId: string, db: Db = prisma): Promise<string | null> {
  const rv = await db.rigVehicle.findFirst({
    where: { vehicleId, removedAt: null, rig: { endedAt: null } },
    orderBy: { addedAt: 'desc' },
    select: { rigId: true },
  })
  return rv?.rigId ?? null
}

async function crewIds(rigId: string, db: Db, openOnly = false): Promise<string[]> {
  const rows = await db.deploymentAssignment.findMany({
    where: { rigId, ...(openOnly && { endedAt: null }) },
    select: { operatorId: true },
  })
  return [...new Set(rows.map((r) => r.operatorId))]
}

/**
 * The first crew check filed for each of the rig's current vehicles on `date` (a
 * business-day Date). Keyed by vehicleId; a vehicle with no crew check is absent.
 */
export async function getRigChecksForDay(rigId: string, date: Date, db: Db = prisma): Promise<Map<string, RigVehicleCheck>> {
  const [vehicles, crew] = await Promise.all([
    db.rigVehicle.findMany({ where: { rigId, removedAt: null }, select: { vehicleId: true } }),
    crewIds(rigId, db),
  ])
  const out = new Map<string, RigVehicleCheck>()
  if (vehicles.length === 0 || crew.length === 0) return out
  const checks = await db.dailyCheck.findMany({
    where: { vehicleId: { in: vehicles.map((v) => v.vehicleId) }, operatorId: { in: crew }, date },
    orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    select: { id: true, vehicleId: true, operatorId: true, submittedAt: true, operator: { select: { name: true } } },
  })
  for (const c of checks) {
    if (out.has(c.vehicleId)) continue
    out.set(c.vehicleId, {
      vehicleId: c.vehicleId,
      checkId: c.id,
      operatorId: c.operatorId,
      operatorName: c.operator.name,
      submittedAt: c.submittedAt,
    })
  }
  return out
}

/**
 * The daily-check POST's crew rule. When `operatorId` is on the crew of the rig the
 * vehicle is on, returns a check a DIFFERENT crew member already filed for that vehicle
 * on `date` — the submit is a second check and is refused. Null otherwise: the vehicle
 * is on no active rig, the submitter isn't on its crew (checking any vehicle stays
 * allowed, UR-033), or only the submitter's own check exists (a same-day redo updates
 * that row; it is not a second check).
 */
export async function findCrewCheckByOther(
  vehicleId: string, date: Date, operatorId: string, db: Db = prisma,
): Promise<RigVehicleCheck | null> {
  const rigId = await getVehicleActiveRigId(vehicleId, db)
  if (!rigId) return null
  const openCrew = await crewIds(rigId, db, true)
  if (!openCrew.includes(operatorId)) return null
  // The submitter's own row for the day (even legacy data where a crewmate's predates
  // it) is a redo of their check, never a second one.
  const own = await db.dailyCheck.findFirst({ where: { vehicleId, date, operatorId }, select: { id: true } })
  if (own) return null
  const existing = (await getRigChecksForDay(rigId, date, db)).get(vehicleId)
  if (!existing || existing.operatorId === operatorId) return null
  return existing
}

/** Wall-clock time of a check in the business timezone, e.g. "7:42 AM". */
export function formatCheckTime(d: Date, tz: string = appTimezone()): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d)
}

/** The 409 body text for a refused second check. */
export function alreadyCheckedMessage(c: RigVehicleCheck, isToday: boolean, date: string): string {
  const when = isToday ? 'today' : `on ${date}`
  return `Already checked ${when} by ${c.operatorName} at ${formatCheckTime(c.submittedAt)}`
}
