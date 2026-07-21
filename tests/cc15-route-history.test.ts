import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { createOperator, createVehicle, createRig, addVehicleToRig } from './helpers/fixtures'
import { getRigRouteHistory, getAdminMapPins } from '../src/lib/deployment-map-queries'

// CC-15 (D2): the read-side that builds "where has this rig been" from daily-check GPS.
async function check(
  vehicleId: string,
  operatorId: string,
  date: string,
  gps: { lat: number; lng: number } | null,
  submittedAt: Date,
) {
  return prisma.dailyCheck.create({
    data: {
      vehicleId,
      operatorId,
      date: new Date(date), // @db.Date — stored as UTC midnight of the business date
      checklistJson: [],
      passFail: true,
      submittedAt,
      gpsLat: gps?.lat ?? null,
      gpsLng: gps?.lng ?? null,
    },
  })
}

describe('CC-15 route history (trail ordering)', () => {
  let operatorId: string
  let rigId: string
  let v1: string
  let v2: string

  beforeEach(async () => {
    const op = await createOperator()
    operatorId = op.id
    const { rig } = await createRig(op.id)
    rigId = rig.id
    v1 = (await createVehicle()).id
    v2 = (await createVehicle()).id
    await addVehicleToRig(rigId, v1)
    await addVehicleToRig(rigId, v2)
  })

  it('returns points ascending by business date, deduped per day (last check wins), GPS-null excluded', async () => {
    // Insert out of chronological order to prove the query sorts, not the insert order.
    await check(v1, operatorId, '2026-07-20', { lat: 41.3, lng: -83.3 }, new Date('2026-07-20T14:00:00Z'))
    await check(v1, operatorId, '2026-07-18', { lat: 41.1, lng: -83.1 }, new Date('2026-07-18T14:00:00Z'))
    await check(v1, operatorId, '2026-07-19', { lat: 41.2, lng: -83.2 }, new Date('2026-07-19T14:00:00Z'))
    // Same business date as the v1 07-20 check, but a LATER submit on a different vehicle —
    // should win the 07-20 point (last check of the day).
    await check(v2, operatorId, '2026-07-20', { lat: 41.9, lng: -83.9 }, new Date('2026-07-20T18:00:00Z'))
    // A check with no GPS must not appear in the trail.
    await check(v1, operatorId, '2026-07-17', null, new Date('2026-07-17T14:00:00Z'))

    const trail = await getRigRouteHistory(rigId)

    expect(trail.map((p) => p.businessDate)).toEqual(['2026-07-18', '2026-07-19', '2026-07-20'])
    // 07-20 collapsed to the later (v2) submission.
    expect(trail[2]).toMatchObject({ businessDate: '2026-07-20', lat: 41.9, lng: -83.9 })
    // The GPS-null 07-17 check is absent.
    expect(trail.some((p) => p.businessDate === '2026-07-17')).toBe(false)
  })

  it('a rig with fewer than 2 GPS points still returns what it has (no trail line drawn client-side)', async () => {
    await check(v1, operatorId, '2026-07-20', { lat: 41.3, lng: -83.3 }, new Date('2026-07-20T14:00:00Z'))
    const trail = await getRigRouteHistory(rigId)
    expect(trail).toHaveLength(1)
  })
})

describe('CC-15 admin map pins', () => {
  it('one pin per active rig, at the latest GPS check across its vehicles', async () => {
    const op = await createOperator()
    const { rig } = await createRig(op.id)
    const v1 = (await createVehicle()).id
    const v2 = (await createVehicle()).id
    await addVehicleToRig(rig.id, v1)
    await addVehicleToRig(rig.id, v2)
    // Older check on v1, newer check on v2 → the pin sits on v2's coords.
    await check(v1, op.id, '2026-07-18', { lat: 41.1, lng: -83.1 }, new Date('2026-07-18T14:00:00Z'))
    await check(v2, op.id, '2026-07-20', { lat: 41.9, lng: -83.9 }, new Date('2026-07-20T14:00:00Z'))

    const pins = await getAdminMapPins()
    const pin = pins.find((p) => p.rigId === rig.id)
    expect(pin).toBeDefined()
    expect(pin).toMatchObject({ lat: 41.9, lng: -83.9, operatorId: op.id })
  })
})
