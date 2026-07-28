import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { hashPin, verifyPin } from '../src/lib/auth/pin'
import { createSession, getSession, getSessionClaims } from '../src/lib/auth/session'
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
