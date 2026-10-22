import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '../src/lib/prisma'
import { hashPin } from '../src/lib/auth/pin'
import { GET as getVehicle } from '../src/app/api/vehicles/[id]/route'
import { createAdminUser, createOperator, createVehicle, operatorSession } from './helpers/fixtures'

// Hotfix 2026-10-22 (H-a): GET /api/vehicles/[id] used to return the full user row of
// whoever did each recent daily check — pinHash, email, hourlyRate, lockout state and
// tokenVersion — to any signed-in user. The checker is now `{ id, name }` only.

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  mockSession = null
})

describe('vehicle details never carry a checker’s account record', () => {
  it('dailyChecks[].operator is exactly { id, name }; no account fields anywhere in the response', async () => {
    await createAdminUser()
    const op = await createOperator({ name: 'Hotfix Checker' })
    const pinHash = await hashPin('482913')
    await prisma.user.update({ where: { id: op.id }, data: { pinHash, hourlyRate: 31.5, failedPinAttempts: 2 } })
    const truck = await createVehicle()
    await prisma.dailyCheck.create({
      data: { vehicleId: truck.id, operatorId: op.id, checklistJson: [], date: new Date('2026-10-21') },
    })

    mockSession = operatorSession(op.id)
    const res = await getVehicle(new NextRequest(`http://localhost/api/vehicles/${truck.id}`), params(truck.id))
    expect(res.status).toBe(200)
    const raw = await res.text()
    const { data } = JSON.parse(raw)

    expect(data.dailyChecks).toHaveLength(1)
    expect(Object.keys(data.dailyChecks[0].operator).sort()).toEqual(['id', 'name'])
    expect(data.dailyChecks[0].operator).toEqual({ id: op.id, name: 'Hotfix Checker' })

    for (const key of ['pinHash', 'email', 'hourlyRate', 'failedPinAttempts', 'tokenVersion']) {
      expect(raw).not.toContain(`"${key}"`)
    }
    expect(raw).not.toContain(pinHash)
    expect(raw).not.toContain(op.email)
  })
})
