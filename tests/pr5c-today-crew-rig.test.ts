import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as getMine } from '../src/app/api/deployments/mine/route'
import { POST as postCheck } from '../src/app/api/daily-check/route'
import { prisma } from '../src/lib/prisma'
import { ensureOpenAssignment, getActiveRigForOperator } from '../src/lib/deployment-assignments'
import { getOperatorToday } from '../src/lib/operator-today'
import { dailyCheckMissed, evalContext } from '../src/lib/alert-evaluators'
import { businessDate } from '../src/lib/business-date'
import { createOperator, createRig, createVehicle, addVehicleToRig, operatorSession } from './helpers/fixtures'

// PR-5c (L-8, owner decision final 2026-10-09): every operator on a rig sees it on
// Today, and the rig's daily checks are shared by its crew.
//  - Today resolves the rig with the same resolver as /api/deployments/mine.
//  - Done is shared: a crewmate's check shows done for everyone, with who and when.
//  - A second crew check of the same vehicle on the same business day is a 409 by name;
//    the filer's own same-day redo still updates their row; a non-crew check is allowed.
//  - The MISSED evaluator counts a crewmate's check for the PRIMARY.

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve(null),
}))

const pass = (vehicleId: string, date = businessDate()) => new NextRequest('http://localhost/api/daily-check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ vehicleId, date, passFail: true, checklistJson: [{ key: 'tires', label: 'Tires', value: 'yes' }] }),
})

async function checkAs(userId: string, vehicleId: string) {
  mockSession = operatorSession(userId)
  const res = await postCheck(pass(vehicleId))
  return { status: res.status, body: await res.json() }
}

async function mineId(userId: string) {
  mockSession = operatorSession(userId)
  return (await (await getMine()).json()).data?.id ?? null
}

describe('PR-5c · Today shows the crew rig', () => {
  let primary: Awaited<ReturnType<typeof createOperator>>
  let crew: Awaited<ReturnType<typeof createOperator>>
  let rigId: string
  let vehicleId: string

  beforeEach(async () => {
    primary = await createOperator({ email: 'pr5c-primary@test.com', name: 'Ana Primary' })
    crew = await createOperator({ email: 'pr5c-crew@test.com', name: 'Ben Crew' })
    const { rig } = await createRig(primary.id)
    rigId = rig.id
    await ensureOpenAssignment({ rigId, operatorId: crew.id, role: 'SECONDARY', addedById: primary.id })
    const v = await createVehicle({ name: 'Crew Truck' })
    vehicleId = v.id
    await addVehicleToRig(rigId, vehicleId)
  })

  it('getActiveRigForOperator returns the rig for a SECONDARY (the reader reading)', async () => {
    expect(await getActiveRigForOperator(crew.id, prisma, { includeSecondary: true })).toBe(rigId)
    // The write-guard default stays PRIMARY-only — no server permission changed.
    expect(await getActiveRigForOperator(crew.id)).toBeNull()
  })

  it('Today and /mine resolve the same rig — PRIMARY, SECONDARY-only, and PRIMARY-older + SECONDARY-newer', async () => {
    expect((await getOperatorToday(primary.id, 'OPERATOR')).deployment?.id).toBe(rigId)
    expect(await mineId(primary.id)).toBe(rigId)
    expect((await getOperatorToday(crew.id, 'OPERATOR')).deployment?.id).toBe(rigId)
    expect(await mineId(crew.id)).toBe(rigId)

    const both = await createOperator({ email: 'pr5c-both@test.com', name: 'Cal Both' })
    const { rig: own } = await createRig(both.id)
    await prisma.rig.update({ where: { id: own.id }, data: { startedAt: new Date(Date.now() - 5 * 86_400_000) } })
    await ensureOpenAssignment({ rigId, operatorId: both.id, role: 'SECONDARY', addedById: primary.id })
    expect((await getOperatorToday(both.id, 'OPERATOR')).deployment?.id).toBe(own.id)
    expect(await mineId(both.id)).toBe(own.id)
  })

  it('Today renders the rig and its due checks for a SECONDARY', async () => {
    const today = await getOperatorToday(crew.id, 'OPERATOR')
    expect(today.deployment?.vehicles.map((v) => v.vehicleId)).toEqual([vehicleId])
    expect(today.deployment?.isPrimary).toBe(false)
    expect(today.deployment?.operator?.id).toBe(primary.id)
    expect(today.checkedVehicleIds).toEqual([])
  })

  it('the done state is shared: one crew check shows done for everyone, with who and when', async () => {
    expect((await checkAs(primary.id, vehicleId)).status).toBe(201)
    const forCrew = await getOperatorToday(crew.id, 'OPERATOR')
    expect(forCrew.checkedVehicleIds).toEqual([vehicleId])
    expect(forCrew.vehicleChecks).toEqual([
      expect.objectContaining({ vehicleId, operatorId: primary.id, operatorName: 'Ana Primary', byMe: false }),
    ])
    const forPrimary = await getOperatorToday(primary.id, 'OPERATOR')
    expect(forPrimary.vehicleChecks[0]).toMatchObject({ byMe: true })
  })

  it('a second crew check of the same vehicle that day is refused by name', async () => {
    await checkAs(primary.id, vehicleId)
    const second = await checkAs(crew.id, vehicleId)
    expect(second.status).toBe(409)
    expect(second.body.error).toMatch(/^Already checked today by Ana Primary at \d{1,2}:\d{2} [AP]M$/)
    expect(await prisma.dailyCheck.count({ where: { vehicleId } })).toBe(1)
  })

  it("the filer's own same-day redo still updates their row; a non-crew check stays allowed", async () => {
    await checkAs(primary.id, vehicleId)
    expect((await checkAs(primary.id, vehicleId)).status).toBe(201)
    const outsider = await createOperator({ email: 'pr5c-out@test.com', name: 'Dee Outside' })
    expect((await checkAs(outsider.id, vehicleId)).status).toBe(201) // UR-033: any vehicle
    expect(await prisma.dailyCheck.count({ where: { vehicleId, operatorId: primary.id } })).toBe(1)
  })

  it("the MISSED evaluator counts a crewmate's check for the PRIMARY", async () => {
    const ctx = evalContext(new Date(), '00:00')
    expect((await dailyCheckMissed.load(primary.id, ctx))?.checkedToday).toBe(false)
    await checkAs(crew.id, vehicleId)
    expect((await dailyCheckMissed.load(primary.id, ctx))?.checkedToday).toBe(true)
  })
})
