// UXP-3 (3b): lockout tells the truth — at the HTTP boundary. Node DB suite (CI-only here).
// Drives POST /api/auth/login end-to-end against the real test DB; only the I/O edges are
// stubbed (alerts, next/headers cookies — the auth-pin-session pattern) plus a switchable
// rate-limit override for the 429 case.
//
// The property under test is two-sided: a locked account that the caller COULD sign into
// says so (401 + locked:true + lockedUntil ISO), while every path an outsider can reach
// (unknown email, inactive account, wrong-role email, wrong PIN below the threshold) keeps
// the byte-identical generic 401 with NO `locked` key — account existence never leaks.
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as login } from '../src/app/api/auth/login/route'
import { hashPin } from '../src/lib/auth/pin'
import { prisma } from '../src/lib/prisma'
import { createOperator, createAdminUser } from './helpers/fixtures'

vi.mock('../src/lib/alerts', () => ({ createAlert: vi.fn().mockResolvedValue({}), resolveActiveAlert: vi.fn().mockResolvedValue({}) }))

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: () => undefined,
      set: () => {},
      delete: () => {},
    }),
}))

// The IP limiter stays REAL (Postgres-backed, wiped between cases by tests/setup.ts) except
// when a case flips this switch to force the 429 branch.
const rl = vi.hoisted(() => ({ denied: false }))
vi.mock('../src/lib/rate-limit', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/lib/rate-limit')>()
  return {
    ...mod,
    rateLimit: (key: string, limit: number, windowMs: number) =>
      rl.denied
        ? Promise.resolve({ allowed: false, remaining: 0, retryAfterSec: 120 })
        : mod.rateLimit(key, limit, windowMs),
  }
})

beforeAll(() => {
  process.env.PIN_SESSION_SECRET =
    process.env.PIN_SESSION_SECRET || 'test-pin-session-secret-0123456789abcdef'
})

const GENERIC_401 = { error: 'Invalid credentials' }
const LOCK_MS = 15 * 60 * 1000

function loginReq(body: unknown) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  })
}

async function operatorWithPin(pin = '123456') {
  const op = await createOperator()
  await prisma.user.update({ where: { id: op.id }, data: { pinHash: await hashPin(pin) } })
  return op
}

/** Lock an account as if the 5th wrong attempt landed `agoMs` ago. */
async function lock(userId: string, agoMs = 60 * 1000) {
  const pinLockedAt = new Date(Date.now() - agoMs)
  await prisma.user.update({ where: { id: userId }, data: { failedPinAttempts: 5, pinLockedAt } })
  return pinLockedAt
}

describe('POST /api/auth/login — lockout tells the truth (UXP-3 3b)', () => {
  it('locked account + CORRECT PIN → 401 with locked:true and an ISO lockedUntil (= pinLockedAt + 15 min)', async () => {
    rl.denied = false
    const op = await operatorWithPin('123456')
    const pinLockedAt = await lock(op.id)
    const res = await login(loginReq({ mode: 'pin', email: op.email, pin: '123456' }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({
      error: 'Too many attempts — your account is temporarily locked.',
      locked: true,
      lockedUntil: new Date(pinLockedAt.getTime() + LOCK_MS).toISOString(),
    })
  })

  it('the 5th wrong attempt through the route already answers locked (the truth lands on that tap)', async () => {
    rl.denied = false
    const op = await operatorWithPin('123456')
    for (let i = 0; i < 4; i++) {
      const res = await login(loginReq({ mode: 'pin', email: op.email, pin: '000000' }))
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual(GENERIC_401)
    }
    const fifth = await login(loginReq({ mode: 'pin', email: op.email, pin: '000000' }))
    expect(fifth.status).toBe(401)
    const body = await fifth.json()
    expect(body.locked).toBe(true)
    expect(typeof body.lockedUntil).toBe('string')
    expect(new Date(body.lockedUntil).getTime()).toBeGreaterThan(Date.now())
  })

  it('wrong PIN below the threshold → the unchanged generic 401 (no locked key)', async () => {
    rl.denied = false
    const op = await operatorWithPin('123456')
    const res = await login(loginReq({ mode: 'pin', email: op.email, pin: '000000' }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual(GENERIC_401)
  })

  it('unknown email → byte-identical generic 401, never a locked key (no existence leak)', async () => {
    rl.denied = false
    const res = await login(loginReq({ mode: 'pin', email: 'nobody-here@test.example', pin: '123456' }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual(GENERIC_401)
    expect('locked' in body).toBe(false)
  })

  it('inactive-but-locked account → generic 401 (the inactive gate runs before the lock is consulted)', async () => {
    rl.denied = false
    const op = await operatorWithPin('123456')
    await lock(op.id)
    await prisma.user.update({ where: { id: op.id }, data: { isActive: false } })
    const res = await login(loginReq({ mode: 'pin', email: op.email, pin: '123456' }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual(GENERIC_401)
  })

  it('locked ADMIN email through the operator PIN tab → generic 401 (the role gate runs before the lock)', async () => {
    rl.denied = false
    const admin = await createAdminUser()
    await prisma.user.update({ where: { id: admin.id }, data: { pinHash: await hashPin('correct-horse') } })
    await lock(admin.id)
    const res = await login(loginReq({ mode: 'pin', email: admin.email, pin: '123456' }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual(GENERIC_401)
  })

  it('locked ADMIN + correct password on the admin tab → the same honest locked 401', async () => {
    rl.denied = false
    const admin = await createAdminUser()
    await prisma.user.update({ where: { id: admin.id }, data: { pinHash: await hashPin('correct-horse') } })
    const pinLockedAt = await lock(admin.id)
    const res = await login(loginReq({ mode: 'admin', email: admin.email, password: 'correct-horse' }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({
      error: 'Too many attempts — your account is temporarily locked.',
      locked: true,
      lockedUntil: new Date(pinLockedAt.getTime() + LOCK_MS).toISOString(),
    })
  })

  it('correct PIN on an unlocked account still signs in (200 + role) — the boolean→result swap broke nothing', async () => {
    rl.denied = false
    const op = await operatorWithPin('123456')
    const res = await login(loginReq({ mode: 'pin', email: op.email, pin: '123456' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ role: 'OPERATOR', mustChangePin: false })
  })

  it('IP limiter tripped → the 429 branch is untouched: its own copy, Retry-After, and NO locked key', async () => {
    rl.denied = true
    try {
      const op = await operatorWithPin('123456')
      await lock(op.id) // even a genuinely locked account gets the limiter copy first
      const res = await login(loginReq({ mode: 'pin', email: op.email, pin: '123456' }))
      expect(res.status).toBe(429)
      expect(res.headers.get('Retry-After')).toBe('120')
      const body = await res.json()
      expect(body).toEqual({ error: 'Too many attempts. Please wait a few minutes and try again.' })
      expect('locked' in body).toBe(false)
    } finally {
      rl.denied = false
    }
  })
})
