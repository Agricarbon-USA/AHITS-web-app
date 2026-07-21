// CC-15 (D2): server-only read queries for the Deployment Map. Imports prisma, so it must
// NEVER be imported by a client component (the pure helpers/types live in `deployment-map.ts`,
// which stays prisma-free for exactly that reason — same discipline as `alert-display.ts`).
//
// Anti-goal guard (DECISIONS.md D2): every position here is the LATEST daily-check
// attestation — "where a rig/operator was last seen", not where they are now. No live
// tracking, no polling. Only GPS-bearing checks (gpsLat/gpsLng non-null) contribute.

import { prisma } from '@/lib/prisma'
import { businessDate } from '@/lib/business-date'
import { getDeploymentRostersForDisplay } from '@/lib/deployment-assignments'
import {
  recencyBucket,
  dbDateToBusinessDate,
  type RigPosition,
  type CrewPosition,
  type TrailPoint,
} from '@/lib/deployment-map'

/** One pin per ACTIVE deployment, placed at the latest GPS-bearing check across its vehicles. */
export async function getAdminMapPins(): Promise<RigPosition[]> {
  const rigs = await prisma.rig.findMany({
    where: { endedAt: null },
    select: {
      id: true,
      vehicles: {
        where: { removedAt: null },
        select: {
          vehicle: {
            select: {
              name: true,
              dailyChecks: {
                where: { gpsLat: { not: null }, gpsLng: { not: null } },
                orderBy: [{ date: 'desc' }, { submittedAt: 'desc' }],
                take: 1,
                select: { gpsLat: true, gpsLng: true, date: true, submittedAt: true },
              },
            },
          },
        },
      },
    },
  })

  const today = businessDate()
  const rosters = await getDeploymentRostersForDisplay(rigs.map((r) => r.id))
  const pins: RigPosition[] = []

  for (const rig of rigs) {
    // Pick the most-recent GPS check across all the rig's current vehicles.
    let best: { lat: number; lng: number; date: Date; submittedAt: Date; vehicleName: string } | null = null
    for (const rv of rig.vehicles) {
      const c = rv.vehicle.dailyChecks[0]
      if (!c || c.gpsLat == null || c.gpsLng == null) continue
      const newer =
        !best ||
        c.date.getTime() > best.date.getTime() ||
        (c.date.getTime() === best.date.getTime() && c.submittedAt.getTime() > best.submittedAt.getTime())
      if (newer) best = { lat: c.gpsLat, lng: c.gpsLng, date: c.date, submittedAt: c.submittedAt, vehicleName: rv.vehicle.name }
    }
    if (!best) continue

    const roster = rosters.get(rig.id)
    const checkBusinessDate = dbDateToBusinessDate(best.date)
    pins.push({
      rigId: rig.id,
      operatorId: roster?.operatorId ?? null,
      operatorName: roster?.operator?.name ?? null,
      vehicleName: best.vehicleName,
      lng: best.lng,
      lat: best.lat,
      checkBusinessDate,
      bucket: recencyBucket(checkBusinessDate, today),
    })
  }

  return pins
}

/**
 * A rig's route history — the chronological sequence of its daily-check GPS points,
 * one point per business day (last check of the day wins), ascending by date. "Where has
 * this rig been", historical only.
 */
export async function getRigRouteHistory(rigId: string): Promise<TrailPoint[]> {
  const rig = await prisma.rig.findUnique({
    where: { id: rigId },
    select: { vehicles: { where: { removedAt: null }, select: { vehicleId: true } } },
  })
  if (!rig) return []
  const vehicleIds = rig.vehicles.map((v) => v.vehicleId)
  if (vehicleIds.length === 0) return []

  const checks = await prisma.dailyCheck.findMany({
    where: { vehicleId: { in: vehicleIds }, gpsLat: { not: null }, gpsLng: { not: null } },
    orderBy: [{ date: 'asc' }, { submittedAt: 'asc' }],
    select: { gpsLat: true, gpsLng: true, date: true },
  })

  // Collapse to one point per business date (the rig's position that day).
  const byDate = new Map<string, TrailPoint>()
  for (const c of checks) {
    if (c.gpsLat == null || c.gpsLng == null) continue
    const bd = dbDateToBusinessDate(c.date)
    byDate.set(bd, { lng: c.gpsLng, lat: c.gpsLat, businessDate: bd })
  }
  return [...byDate.values()].sort((a, b) => a.businessDate.localeCompare(b.businessDate))
}

/**
 * Other operators' LAST-KNOWN positions, for crew coordination (gear swap / request help).
 * Scoped to operators currently deployed on an active rig, minus the viewer. Each position
 * is that operator's most recent GPS-bearing attestation — never live.
 */
export async function getCrewLastKnown(excludeOperatorId: string): Promise<CrewPosition[]> {
  const activeRigs = await prisma.rig.findMany({ where: { endedAt: null }, select: { id: true } })
  const rosters = await getDeploymentRostersForDisplay(activeRigs.map((r) => r.id))

  const operatorIds = new Set<string>()
  for (const roster of rosters.values()) {
    if (roster.operatorId) operatorIds.add(roster.operatorId)
    for (const s of roster.secondaryOperators) if (s.operator?.id) operatorIds.add(s.operator.id)
  }
  operatorIds.delete(excludeOperatorId)
  if (operatorIds.size === 0) return []

  const today = businessDate()
  const positions: CrewPosition[] = []
  for (const opId of operatorIds) {
    const c = await prisma.dailyCheck.findFirst({
      where: { operatorId: opId, gpsLat: { not: null }, gpsLng: { not: null } },
      orderBy: [{ date: 'desc' }, { submittedAt: 'desc' }],
      select: {
        gpsLat: true,
        gpsLng: true,
        date: true,
        operator: { select: { name: true } },
        vehicle: { select: { name: true } },
      },
    })
    if (!c || c.gpsLat == null || c.gpsLng == null) continue
    const bd = dbDateToBusinessDate(c.date)
    positions.push({
      operatorId: opId,
      operatorName: c.operator?.name ?? null,
      vehicleName: c.vehicle?.name ?? null,
      lng: c.gpsLng,
      lat: c.gpsLat,
      checkBusinessDate: bd,
      bucket: recencyBucket(bd, today),
    })
  }
  return positions
}
