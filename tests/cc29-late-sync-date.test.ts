import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as dailyCheck } from '../src/app/api/daily-check/route'
import { resolveActiveAlert } from '../src/lib/alerts'
import { businessDate } from '../src/lib/business-date'
import { prisma } from '../src/lib/prisma'
import { createOperator, createVehicle, operatorSession } from './helpers/fixtures'

// CC-29 item 4 (review §1.1) — late-synced daily-check date semantics. A check
// queued/parked on day N and replayed later must carry its ORIGINAL business date
// (bounded to a 3-day past window), never be re-dated to the sync day and silently
// overwrite (or be overwritten by) another day's check. Product decision, Max
// 2026-07-28. See DECISIONS.md.

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve(null),
}))
vi.mock('../src/lib/alerts', () => ({
  createAlert: vi.fn().mockResolvedValue({}),
  resolveActiveAlert: vi.fn().mockResolvedValue({}),
}))

const today = () => businessDate()
const daysAgo = (n: number) => businessDate(new Date(Date.now() - n * 86_400_000))
const daysAhead = (n: number) => businessDate(new Date(Date.now() + n * 86_400_000))

function post(body: unknown) {
  return dailyCheck(new NextRequest('http://localhost/api/daily-check', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }))
}

function checkBody(vehicleId: string, date: string, over: Record<string, unknown> = {}) {
  return {
    vehicleId,
    date,
    passFail: true,
    checklistJson: [{ key: 'brakes', label: 'Brakes', value: 'yes' }],
    ...over,
  }
}

// The DB stores date as UTC-midnight of the YYYY-MM-DD; read it back the same way.
function storedDate(d: Date) { return d.toISOString().slice(0, 10) }

describe('CC-29: late-synced daily check keeps its original business date (bounded window)', () => {
  beforeEach(() => {
    vi.mocked(resolveActiveAlert).mockClear()
  })

  it('a within-window PAST date (yesterday) is stored under the day performed, not today', async () => {
    const op = await createOperator()
    const veh = await createVehicle()
    mockSession = operatorSession(op.id)

    const res = await post(checkBody(veh.id, daysAgo(1)))
    expect(res.status).toBe(201)

    const row = await prisma.dailyCheck.findFirst({ where: { vehicleId: veh.id, operatorId: op.id } })
    expect(row).not.toBeNull()
    expect(storedDate(row!.date)).toBe(daysAgo(1))
  })

  it('a colliding PAST date returns 409 (surfaced, never a silent merge)', async () => {
    const op = await createOperator()
    const veh = await createVehicle()
    mockSession = operatorSession(op.id)

    const first = await post(checkBody(veh.id, daysAgo(1), { odometer: 100 }))
    expect(first.status).toBe(201)

    // A DIFFERENT check for the same past day (no matching idempotency key) must NOT
    // upsert-overwrite the first — it 409s so the queue surfaces it as 'failed'.
    const second = await post(checkBody(veh.id, daysAgo(1), { odometer: 999 }))
    expect(second.status).toBe(409)
    expect((await second.json()).error).toMatch(/already exists for this vehicle/i)

    // The original row is untouched.
    const row = await prisma.dailyCheck.findFirst({ where: { vehicleId: veh.id, operatorId: op.id } })
    expect(row!.odometer).toBe(100)
  })

  it('a FUTURE date is clamped to today (FND-7: future-dating still blocked)', async () => {
    const op = await createOperator()
    const veh = await createVehicle()
    mockSession = operatorSession(op.id)

    const res = await post(checkBody(veh.id, daysAhead(1)))
    expect(res.status).toBe(201)
    const row = await prisma.dailyCheck.findFirst({ where: { vehicleId: veh.id, operatorId: op.id } })
    expect(storedDate(row!.date)).toBe(today())
  })

  it('an out-of-window (5-day-old) date is clamped to today', async () => {
    const op = await createOperator()
    const veh = await createVehicle()
    mockSession = operatorSession(op.id)

    const res = await post(checkBody(veh.id, daysAgo(5)))
    expect(res.status).toBe(201)
    const row = await prisma.dailyCheck.findFirst({ where: { vehicleId: veh.id, operatorId: op.id } })
    expect(storedDate(row!.date)).toBe(today())
  })

  it('a PAST-date check does NOT resolve today\'s DAILY_CHECK_MISSED alert', async () => {
    const op = await createOperator()
    const veh = await createVehicle()
    mockSession = operatorSession(op.id)

    const res = await post(checkBody(veh.id, daysAgo(1)))
    expect(res.status).toBe(201)
    // isToday is false → the MISSED (and pass-resolve FAILED) alerts must stay untouched.
    expect(resolveActiveAlert).not.toHaveBeenCalledWith('DAILY_CHECK_MISSED', 'operators', op.id)
  })

  it('a same-day resubmit still upsert-updates (409 is only for PAST collisions)', async () => {
    const op = await createOperator()
    const veh = await createVehicle()
    mockSession = operatorSession(op.id)

    const first = await post(checkBody(veh.id, today(), { odometer: 10 }))
    expect(first.status).toBe(201)
    const second = await post(checkBody(veh.id, today(), { odometer: 20 }))
    expect(second.status).toBe(201) // updated, not 409
    const rows = await prisma.dailyCheck.findMany({ where: { vehicleId: veh.id, operatorId: op.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].odometer).toBe(20)
  })
})
