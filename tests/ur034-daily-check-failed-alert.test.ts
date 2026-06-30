import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as dailyCheck } from '../src/app/api/daily-check/route'
import { createAlert, resolveActiveAlert } from '../src/lib/alerts'
import { createOperator, createVehicle, operatorSession } from './helpers/fixtures'

// UR-034 regression: a failing daily check used to only email ADMIN_EMAIL — no
// in-app alert, no bell notification — so a failed safety check was invisible
// in-app when email was unconfigured. It now raises a DAILY_CHECK_FAILED alert
// (cleared by a later pass). Also pins UR-033: checks are allowed on ANY vehicle,
// not just one in the operator's active deployment.

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

function req(body: unknown) {
  return new NextRequest('http://localhost/api/daily-check', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('UR-034 / UR-033: failed daily check raises an in-app alert; checks allowed on any vehicle', () => {
  beforeEach(() => {
    vi.mocked(createAlert).mockClear()
    vi.mocked(resolveActiveAlert).mockClear()
  })

  it('raises a DAILY_CHECK_FAILED alert on a failing check (operator not on any deployment — UR-033)', async () => {
    const op = await createOperator()
    const veh = await createVehicle()
    mockSession = operatorSession(op.id)

    const res = await dailyCheck(req({
      vehicleId: veh.id,
      date: '2026-06-25',
      passFail: false,
      issues: 'brakes soft',
      checklistJson: [{ key: 'brakes', label: 'Brakes', value: 'no', note: 'soft pedal' }],
    }))

    expect(res.status).toBe(201) // allowed despite no active deployment (UR-033)
    expect(createAlert).toHaveBeenCalledWith('DAILY_CHECK_FAILED', 'vehicles', veh.id, expect.anything())
    // DAILY_CHECK_MISSED is cleared unconditionally on any submit; DAILY_CHECK_FAILED is NOT cleared on a fail
    expect(resolveActiveAlert).toHaveBeenCalledTimes(1)
    expect(resolveActiveAlert).toHaveBeenCalledWith('DAILY_CHECK_MISSED', 'operators', op.id)
  })

  it('clears the alert on a subsequent passing check', async () => {
    const op = await createOperator()
    const veh = await createVehicle()
    mockSession = operatorSession(op.id)

    const res = await dailyCheck(req({
      vehicleId: veh.id,
      date: '2026-06-25',
      passFail: true,
      checklistJson: [{ key: 'brakes', label: 'Brakes', value: 'yes' }],
    }))

    expect(res.status).toBe(201)
    expect(resolveActiveAlert).toHaveBeenCalledWith('DAILY_CHECK_FAILED', 'vehicles', veh.id)
    expect(resolveActiveAlert).toHaveBeenCalledWith('DAILY_CHECK_MISSED', 'operators', op.id)
    expect(createAlert).not.toHaveBeenCalled()
  })
})
