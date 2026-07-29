import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '../src/lib/prisma'
import { getDailyCheckAdoption, getPilotMetrics } from '../src/lib/pilot-metrics'
import { GET as pilotMetricsRoute } from '../src/app/api/admin/pilot-metrics/route'
import { businessDate } from '../src/lib/business-date'
import { createOperator, createRig, createVehicle, addVehicleToRig, operatorSession, adminSession } from './helpers/fixtures'

// ── CC-14 / CC-31 Pilot Charter read-side ───────────────────────────────────────
// metric 1 (adoption) + metric 2 (time-to-complete) + CC-31's GPS grant rate,
// durationMs distribution, the <20s flag, snapshot-per-day eligibility (6b), and the
// admin-only route gate.

let mockSession: { userId: string; role: string; name?: string; email?: string } | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () =>
    Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))

async function fileCheck(
  vehicleId: string,
  operatorId: string,
  extra?: { durationMs?: number; gpsLat?: number; day?: string },
) {
  return prisma.dailyCheck.create({
    data: {
      vehicleId,
      operatorId,
      date: new Date(extra?.day ?? businessDate()),
      checklistJson: [],
      passFail: true,
      durationMs: extra?.durationMs,
      gpsLat: extra?.gpsLat,
      gpsLng: extra?.gpsLat != null ? -80 : undefined,
    },
  })
}

describe('CC-14 daily-check adoption', () => {
  it('counts eligible vehicles on active deployments and the checked subset', async () => {
    const before = await getDailyCheckAdoption()

    const op = await createOperator()
    const { rig } = await createRig(op.id)
    const v1 = await createVehicle()
    const v2 = await createVehicle()
    await addVehicleToRig(rig.id, v1.id)
    await addVehicleToRig(rig.id, v2.id)
    await fileCheck(v1.id, op.id, { durationMs: 90_000 })

    const after = await getDailyCheckAdoption()
    expect(after.eligibleVehicles - before.eligibleVehicles).toBe(2)
    expect(after.checkedVehicles - before.checkedVehicles).toBe(1)
    expect(after.adoptionRate).not.toBeNull()
    expect(after.durationSampleSize).toBeGreaterThanOrEqual(1)
    expect(after.avgDurationMs).not.toBeNull()
  })

  it('does not count a check on a vehicle that is not on an active deployment', async () => {
    const op = await createOperator()
    const loose = await createVehicle()

    const before = await getDailyCheckAdoption()
    await fileCheck(loose.id, op.id)
    const after = await getDailyCheckAdoption()

    expect(after.eligibleVehicles).toBe(before.eligibleVehicles)
    expect(after.checkedVehicles).toBe(before.checkedVehicles)
  })

  // CC-31 item 6b: eligibility is snapshotted per queried day, not from rigs active NOW.
  // A rig whose window was in the past counts for the day it was active, never today.
  it('snapshots eligibility per day — a since-ended rig counts for its active day, not today', async () => {
    const today = businessDate()
    const activeDay = businessDate(new Date(Date.now() - 2 * 86_400_000)) // 2 days ago

    const tBefore = await getDailyCheckAdoption(today)
    const dBefore = await getDailyCheckAdoption(activeDay)

    const op = await createOperator()
    const { rig } = await createRig(op.id)
    const v = await createVehicle()
    const rv = await addVehicleToRig(rig.id, v.id)
    // Backdate the rig window to [3d ago, 2d ago] (raw — @default/@updatedAt columns).
    const started = new Date(Date.now() - 3 * 86_400_000)
    const ended = new Date(Date.now() - 2 * 86_400_000)
    await prisma.$executeRaw`UPDATE "rigs" SET "startedAt" = ${started}, "endedAt" = ${ended} WHERE "id" = ${rig.id}`
    await prisma.$executeRaw`UPDATE "rig_vehicles" SET "addedAt" = ${started} WHERE "id" = ${rv.id}`

    const tAfter = await getDailyCheckAdoption(today)
    const dAfter = await getDailyCheckAdoption(activeDay)

    // Eligible for the day it was active…
    expect(dAfter.eligibleVehicles - dBefore.eligibleVehicles).toBe(1)
    // …but NOT for today (its window ended before today began).
    expect(tAfter.eligibleVehicles - tBefore.eligibleVehicles).toBe(0)
  })
})

describe('CC-31 pilot dashboard metrics', () => {
  it('computes the GPS grant rate over the day’s checks', async () => {
    const op = await createOperator()
    const v1 = await createVehicle()
    const v2 = await createVehicle()
    await fileCheck(v1.id, op.id, { gpsLat: 41.5 }) // has a fix
    await fileCheck(v2.id, op.id) // no fix

    const day = (await getPilotMetrics(businessDate(), businessDate())).days[0]
    expect(day.gpsSampleSize).toBe(2)
    expect(day.gpsGrantRate).toBeCloseTo(0.5)
  })

  it('buckets durations and flags checks under 20s', async () => {
    const op = await createOperator()
    const vFast = await createVehicle()
    const vSlow = await createVehicle()
    await fileCheck(vFast.id, op.id, { durationMs: 5_000 })  // < 20s
    await fileCheck(vSlow.id, op.id, { durationMs: 90_000 }) // 90s → under3m bucket

    const day = (await getPilotMetrics(businessDate(), businessDate())).days[0]
    expect(day.durationBuckets.under20s).toBe(1)
    expect(day.flaggedFastCount).toBe(1)
    expect(day.durationBuckets.under3m).toBe(1)
    expect(day.durationSampleSize).toBe(2)
  })

  it('denies the route to a non-admin (operator) with 403', async () => {
    const op = await createOperator()
    mockSession = operatorSession(op.id)
    const res = await pilotMetricsRoute(new NextRequest('http://localhost/api/admin/pilot-metrics'))
    expect(res.status).toBe(403)
  })

  it('serves an admin the metrics payload', async () => {
    const admin = await createOperator({ name: 'A' })
    // promote to admin session shape
    mockSession = adminSession(admin.id)
    const res = await pilotMetricsRoute(new NextRequest('http://localhost/api/admin/pilot-metrics'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data.days)).toBe(true)
    expect(body.data.breakdown).toBeTruthy()
  })
})
