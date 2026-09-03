import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { createAlert } from '@/lib/alerts'

const MAX_ATTEMPTS = 5
const LOCK_DURATION_MS = 15 * 60 * 1000 // 15 minutes

/**
 * UXP-3 (3b): the one sentence every route returns for an active lock. The
 * login card replaces it with a "locked until HH:MM" line built from
 * `lockedUntil`; other callers (change-pin) surface it verbatim.
 */
export const PIN_LOCKED_ERROR = 'Too many attempts — your account is temporarily locked.'

/**
 * UXP-3 (3b): lockout tells the truth. Before this a locked account and a wrong
 * PIN were the same `false`, so a locked-out operator saw "Invalid credentials"
 * for 15 minutes and re-typed the right PIN — every attempt re-confirming the lie.
 * The attempt that TRIPS the lock also answers `locked`, so the truth lands on
 * that tap, not the next one.
 */
export type PinVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'wrong' | 'no-pin' }
  | { ok: false; reason: 'locked'; lockedUntil: Date }

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 12)
}

export async function verifyPinDetailed(userId: string, pin: string): Promise<PinVerifyResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.pinHash) return { ok: false, reason: 'no-pin' }

  // Check lockout
  if (user.pinLockedAt) {
    const elapsed = Date.now() - user.pinLockedAt.getTime()
    if (elapsed < LOCK_DURATION_MS) {
      return { ok: false, reason: 'locked', lockedUntil: new Date(user.pinLockedAt.getTime() + LOCK_DURATION_MS) }
    }
    // Auto-unlock after duration
    await prisma.user.update({
      where: { id: userId },
      data: { pinLockedAt: null, failedPinAttempts: 0 },
    })
  }

  const valid = await bcrypt.compare(pin, user.pinHash)

  if (!valid) {
    const incremented = await prisma.user.update({
      where: { id: userId },
      data: { failedPinAttempts: { increment: 1 } },
      select: { failedPinAttempts: true },
    })
    const attempts = incremented.failedPinAttempts
    if (attempts >= MAX_ATTEMPTS) {
      const lockedAt = new Date()
      await prisma.user.update({
        where: { id: userId },
        data: { pinLockedAt: lockedAt },
      })
      createAlert('PIN_LOCKED', 'users', userId, { name: user.name, email: user.email }).catch(() => {})
      return { ok: false, reason: 'locked', lockedUntil: new Date(lockedAt.getTime() + LOCK_DURATION_MS) }
    }
    return { ok: false, reason: 'wrong' }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { failedPinAttempts: 0, lastLoginAt: new Date() },
  })
  return { ok: true }
}

/** Boolean view of verifyPinDetailed — for callers that only need pass/fail. */
export async function verifyPin(userId: string, pin: string): Promise<boolean> {
  return (await verifyPinDetailed(userId, pin)).ok
}
