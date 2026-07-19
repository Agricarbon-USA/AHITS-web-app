import { describe, it, expect } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { getDailyCheckAdoption } from '../src/lib/pilot-metrics'
import { businessDate } from '../src/lib/business-date'
import { createOperator, createRig, createVehicle, addVehicleToRig } from './helpers/fixtures'

// ── CC-14 Pilot Charter metric 1: daily-check adoption denominator ──────────────
// eligible = distinct vehicles on active deployments; done = eligible vehicles checked
// on the business date; rate = done / eligible. Must exist day 1 of the pilot.

async function fileCheck(vehicleId: string, operatorId: string, durationMs?: number) {
  return prisma.dailyCheck.create({
    data: { vehicleId, operatorId, date: new Date(businessDate()), checklistJson: [], durationMs },
  })
}

describe('CC-14 daily-check adoption', () => {
  it('counts eligible vehicles on active deployments and the checked subset', async () => {
    const op = await createOperator()
    const { rig } = await createRig(op.id)
    const v1 = await createVehicle()
    const v2 = await createVehicle()
    await addVehicleToRig(rig.id, v1.id)
    await addVehicleToRig(rig.id, v2.id)

    const before = await getDailyCheckAdoption()
    // Two more eligible vehicles exist now; one gets checked.
    await fileCheck(v1.id, op.id, 90_000)

    const after = await getDailyCheckAdoption()
    expect(after.eligibleVehicles - before.eligibleVehicles).toBe(2)
    expect(after.checkedVehicles - before.checkedVehicles).toBe(1)
    expect(after.adoptionRate).not.toBeNull()
    // avg duration reflects the one timed check (>= its own value present in the sample)
    expect(after.durationSampleSize).toBeGreaterThanOrEqual(1)
    expect(after.avgDurationMs).not.toBeNull()
  })

  it('does not count a check on a vehicle that is not on an active deployment', async () => {
    const op = await createOperator()
    const loose = await createVehicle() // never added to a rig

    const before = await getDailyCheckAdoption()
    await fileCheck(loose.id, op.id)
    const after = await getDailyCheckAdoption()

    // The loose vehicle is neither eligible nor counted as done.
    expect(after.eligibleVehicles).toBe(before.eligibleVehicles)
    expect(after.checkedVehicles).toBe(before.checkedVehicles)
  })

  it('excludes vehicles on ended deployments from the eligible set', async () => {
    const op = await createOperator()
    const { rig } = await createRig(op.id)
    const v = await createVehicle()
    await addVehicleToRig(rig.id, v.id)

    const withActive = await getDailyCheckAdoption()
    await prisma.rig.update({ where: { id: rig.id }, data: { endedAt: new Date() } })
    const withEnded = await getDailyCheckAdoption()

    expect(withActive.eligibleVehicles - withEnded.eligibleVehicles).toBe(1)
  })
})
