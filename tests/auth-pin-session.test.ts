import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { SignJWT, decodeJwt } from 'jose'
import { hashPin, verifyPin, verifyPinDetailed } from '../src/lib/auth/pin'
import { createSession, getSession, getSessionClaims } from '../src/lib/auth/session'
import {
  MAX_SESSION_LIFETIME,
  SESSION_DURATION,
  maybeRenewSessionToken,
  mintSessionToken,
} from '../src/lib/auth/session-edge'
import { proxy } from '../src/proxy'
import { prisma } from '../src/lib/prisma'
import { createOperator } from './helpers/fixtures'

// These exercise the REAL auth logic — only the I/O edges are stubbed:
//   • next/headers cookies() is faked so getSession can read a controllable token
//   • alerts are no-ops
vi.mock('../src/lib/alerts', () => ({ createAlert: vi.fn().mockResolvedValue({}), resolveActiveAlert: vi.fn().mockResolvedValue({}) }))

let cookieToken: string | undefined
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'ahits_session' && cookieToken ? { value: cookieToken } : undefined,
      set: () => {},
      delete: () => {},
    }),
}))

beforeAll(() => {
  process.env.PIN_SESSION_SECRET =
    process.env.PIN_SESSION_SECRET || 'test-pin-session-secret-0123456789abcdef'
})

beforeEach(() => {
  cookieToken = undefined
})

describe('PIN auth — verifyPin lockout', () => {
  async function operatorWithPin(pin = '123456') {
    const op = await createOperator()
    await prisma.user.update({ where: { id: op.id }, data: { pinHash: await hashPin(pin) } })
    return op
  }

  it('accepts the correct PIN and resets the failure counter', async () => {
    const op = await operatorWithPin('123456')
    await prisma.user.update({ where: { id: op.id }, data: { failedPinAttempts: 3 } })
    expect(await verifyPin(op.id, '123456')).toBe(true)
    const after = await prisma.user.findUnique({ where: { id: op.id } })
    expect(after?.failedPinAttempts).toBe(0)
  })

  it('locks after 5 wrong attempts and rejects even the correct PIN while locked', async () => {
    const op = await operatorWithPin('123456')
    for (let i = 0; i < 5; i++) {
      expect(await verifyPin(op.id, '000000')).toBe(false)
    }
    const locked = await prisma.user.findUnique({ where: { id: op.id } })
    expect(locked?.failedPinAttempts).toBeGreaterThanOrEqual(5)
    expect(locked?.pinLockedAt).not.toBeNull()
    // The correct PIN must still be rejected while the lock window is active.
    expect(await verifyPin(op.id, '123456')).toBe(false)
  })

  it('auto-unlocks once the lock window has elapsed', async () => {
    const op = await operatorWithPin('123456')
    await prisma.user.update({
      where: { id: op.id },
      data: { failedPinAttempts: 5, pinLockedAt: new Date(Date.now() - 16 * 60 * 1000) },
    })
    expect(await verifyPin(op.id, '123456')).toBe(true)
    const after = await prisma.user.findUnique({ where: { id: op.id } })
    expect(after?.pinLockedAt).toBeNull()
    expect(after?.failedPinAttempts).toBe(0)
  })

  it('returns false for a user with no PIN set', async () => {
    const op = await createOperator()
    expect(await verifyPin(op.id, '123456')).toBe(false)
  })
})

// UXP-3 (3b): lockout tells the truth. verifyPinDetailed distinguishes a lock from a
// wrong PIN (verifyPin above stays the boolean view, so the cases above are unchanged).
describe('PIN auth — verifyPinDetailed (UXP-3 3b)', () => {
  const LOCK_MS = 15 * 60 * 1000

  async function operatorWithPin(pin = '123456') {
    const op = await createOperator()
    await prisma.user.update({ where: { id: op.id }, data: { pinHash: await hashPin(pin) } })
    return op
  }

  it('answers "wrong" for a wrong PIN below the threshold', async () => {
    const op = await operatorWithPin('123456')
    expect(await verifyPinDetailed(op.id, '000000')).toEqual({ ok: false, reason: 'wrong' })
  })

  it('answers "no-pin" for a user with no PIN set', async () => {
    const op = await createOperator()
    expect(await verifyPinDetailed(op.id, '123456')).toEqual({ ok: false, reason: 'no-pin' })
  })

  it('the 5th wrong attempt — the one that TRIPS the lock — already answers "locked" (+15 min)', async () => {
    const op = await operatorWithPin('123456')
    for (let i = 0; i < 4; i++) {
      expect(await verifyPinDetailed(op.id, '000000')).toEqual({ ok: false, reason: 'wrong' })
    }
    const before = Date.now()
    const fifth = await verifyPinDetailed(op.id, '000000')
    expect(fifth.ok).toBe(false)
    if (fifth.ok || fifth.reason !== 'locked') throw new Error(`expected locked, got ${JSON.stringify(fifth)}`)
    // lockedUntil ≈ now + 15 min (bounded by the wall-clock drift of the call itself).
    expect(fifth.lockedUntil.getTime()).toBeGreaterThanOrEqual(before + LOCK_MS)
    expect(fifth.lockedUntil.getTime()).toBeLessThanOrEqual(Date.now() + LOCK_MS)
    const locked = await prisma.user.findUnique({ where: { id: op.id } })
    expect(locked?.pinLockedAt).not.toBeNull()
  })

  it('answers "locked" with lockedUntil = pinLockedAt + 15 min even for the CORRECT PIN', async () => {
    const op = await operatorWithPin('123456')
    const lockedAt = new Date(Date.now() - 5 * 60 * 1000) // locked 5 minutes ago
    await prisma.user.update({
      where: { id: op.id },
      data: { failedPinAttempts: 5, pinLockedAt: lockedAt },
    })
    expect(await verifyPinDetailed(op.id, '123456')).toEqual({
      ok: false, reason: 'locked', lockedUntil: new Date(lockedAt.getTime() + LOCK_MS),
    })
    // Still locked — the correct PIN must not have reset anything.
    const after = await prisma.user.findUnique({ where: { id: op.id } })
    expect(after?.pinLockedAt?.getTime()).toBe(lockedAt.getTime())
  })

  it('answers ok:true once the lock window has elapsed (auto-unlock path unchanged)', async () => {
    const op = await operatorWithPin('123456')
    await prisma.user.update({
      where: { id: op.id },
      data: { failedPinAttempts: 5, pinLockedAt: new Date(Date.now() - 16 * 60 * 1000) },
    })
    expect(await verifyPinDetailed(op.id, '123456')).toEqual({ ok: true })
  })
})

describe('Session — getSession revocation & validation', () => {
  function tokenFor(
    user: { id: string; name: string; email: string },
    role: 'OPERATOR' | 'ADMIN' = 'OPERATOR',
    tokenVersion = 0,
  ) {
    return createSession({ userId: user.id, role, name: user.name, email: user.email, tokenVersion })
  }

  it('returns the session for a valid token matching the DB', async () => {
    const op = await createOperator()
    cookieToken = await tokenFor(op)
    const s = await getSession()
    expect(s?.userId).toBe(op.id)
    expect(s?.role).toBe('OPERATOR')
  })

  it('invalidates the session when tokenVersion is bumped (force-logout / revoke-all)', async () => {
    const op = await createOperator()
    cookieToken = await tokenFor(op, 'OPERATOR', 0)
    await prisma.user.update({ where: { id: op.id }, data: { tokenVersion: 1 } })
    expect(await getSession()).toBeNull()
  })

  it('invalidates the session when the user is deactivated', async () => {
    const op = await createOperator()
    cookieToken = await tokenFor(op)
    await prisma.user.update({ where: { id: op.id }, data: { isActive: false } })
    expect(await getSession()).toBeNull()
  })

  it('reflects a role change immediately (reads fresh role from the DB)', async () => {
    const op = await createOperator()
    cookieToken = await tokenFor(op, 'OPERATOR', 0)
    await prisma.user.update({ where: { id: op.id }, data: { role: 'ADMIN' } })
    const s = await getSession()
    expect(s?.role).toBe('ADMIN')
  })

  it('returns null for a missing or malformed token', async () => {
    cookieToken = undefined
    expect(await getSession()).toBeNull()
    cookieToken = 'not-a-jwt'
    expect(await getSession()).toBeNull()
  })

  it('returns null when the user no longer exists', async () => {
    const op = await createOperator()
    cookieToken = await tokenFor(op)
    await prisma.user.delete({ where: { id: op.id } })
    expect(await getSession()).toBeNull()
  })
})

// UR-004 + UR-036 (Option A): getSessionClaims verifies the JWT locally (no DB)
// and carries mustChangePin so the edge middleware can gate a forced-PIN-reset
// operator server-side.
describe('Session — getSessionClaims (local verify) + mustChangePin (UR-004)', () => {
  it('reflects mustChangePin=true from the token without a DB read', async () => {
    const op = await createOperator()
    cookieToken = await createSession({
      userId: op.id, role: 'OPERATOR', name: op.name, email: op.email, tokenVersion: 0, mustChangePin: true,
    })
    const c = await getSessionClaims()
    expect(c?.userId).toBe(op.id)
    expect(c?.mustChangePin).toBe(true)
  })

  it('defaults mustChangePin to false when not signed into the token', async () => {
    const op = await createOperator()
    cookieToken = await createSession({
      userId: op.id, role: 'OPERATOR', name: op.name, email: op.email, tokenVersion: 0,
    })
    const c = await getSessionClaims()
    expect(c?.mustChangePin).toBe(false)
  })

  it('returns null for a missing or malformed token', async () => {
    cookieToken = undefined
    expect(await getSessionClaims()).toBeNull()
    cookieToken = 'not-a-jwt'
    expect(await getSessionClaims()).toBeNull()
  })
})

// REQ-C: a phone stays signed in for 4 idle days. Use more than 1 hour after the last
// renewal renews; a sign-in never outlives authAt + 14 days.
describe('Session — 4-day idle sign-in, renewal after 1 hour, 14-day cap (REQ-C)', () => {
  const HOUR = 60 * 60
  const DAY = 24 * HOUR
  const claims = {
    userId: 'user-req-c',
    role: 'OPERATOR' as const,
    name: 'ZZ Operator',
    email: 'zz-operator@test.example',
    tokenVersion: 3,
    mustChangePin: false,
  }
  const secret = () => new TextEncoder().encode(process.env.PIN_SESSION_SECRET)
  const nowSec = () => Math.floor(Date.now() / 1000)

  // mintSessionToken always stamps "now", so an old token is signed by hand.
  function signOld(ageSec: number, authAt: number) {
    const now = nowSec()
    return new SignJWT({ ...claims, authAt })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now - ageSec)
      .setExpirationTime(now + HOUR)
      .sign(secret())
  }

  it('a fresh token lasts SESSION_DURATION (4 days)', async () => {
    const token = await mintSessionToken({ ...claims, authAt: nowSec() })
    const { iat, exp } = decodeJwt(token)
    expect(exp! - iat!).toBe(SESSION_DURATION)
    expect(SESSION_DURATION).toBe(4 * DAY)
  })

  it('does not renew a token 30 minutes old', async () => {
    const payload = decodeJwt(await signOld(30 * 60, nowSec() - 30 * 60))
    expect(await maybeRenewSessionToken(payload, nowSec())).toBeNull()
  })

  it('renews a token 61 minutes old with the same claims and authAt', async () => {
    const authAt = nowSec() - 2 * DAY
    const payload = decodeJwt(await signOld(61 * 60, authAt))
    const renewed = await maybeRenewSessionToken(payload, nowSec())
    expect(renewed).not.toBeNull()
    const next = decodeJwt(renewed!)
    expect(next).toMatchObject({ ...claims, authAt })
    expect(next.iat).toBeGreaterThan(payload.iat!)
    expect(next.exp! - next.iat!).toBe(SESSION_DURATION)
  })

  it('a renewal 13 days after the PIN ends exactly 14 days after it', async () => {
    const authAt = nowSec() - 13 * DAY
    const payload = decodeJwt(await signOld(2 * HOUR, authAt))
    const renewed = await maybeRenewSessionToken(payload, nowSec())
    expect(renewed).not.toBeNull()
    expect(decodeJwt(renewed!).exp).toBe(authAt + MAX_SESSION_LIFETIME)
  })

  it('does not renew exactly 14 days after the PIN', async () => {
    const now = nowSec()
    const payload = decodeJwt(await signOld(2 * HOUR, now - MAX_SESSION_LIFETIME))
    expect(await maybeRenewSessionToken(payload, now)).toBeNull()
  })

  it('proxy renews a 2-hour-old sign-in on /api/notifications, not on /api/auth/logout', async () => {
    const token = await signOld(2 * HOUR, nowSec() - 2 * HOUR)
    const req = (path: string) =>
      new NextRequest(`http://localhost${path}`, { headers: { cookie: `ahits_session=${token}` } })

    const renewedRes = await proxy(req('/api/notifications'))
    const cookie = renewedRes.cookies.get('ahits_session')
    expect(cookie?.value).toBeTruthy()
    expect(cookie?.value).not.toBe(token)

    const logoutRes = await proxy(req('/api/auth/logout'))
    expect(logoutRes.cookies.get('ahits_session')).toBeUndefined()
  })
})
