import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { createAlert } from '@/lib/alerts'

const MAX_ATTEMPTS = 5
const LOCK_DURATION_MS = 15 * 60 * 1000 // 15 minutes

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 12)
}

export async function verifyPin(userId: string, pin: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.pinHash) return false

  // Check lockout
  if (user.pinLockedAt) {
    const elapsed = Date.now() - user.pinLockedAt.getTime()
    if (elapsed < LOCK_DURATION_MS) return false
    // Auto-unlock after duration
    await prisma.user.update({
      where: { id: userId },
      data: { pinLockedAt: null, failedPinAttempts: 0 },
    })
  }

  const valid = await bcrypt.compare(pin, user.pinHash)

  if (!valid) {
    const attempts = user.failedPinAttempts + 1
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedPinAttempts: attempts,
        pinLockedAt: attempts >= MAX_ATTEMPTS ? new Date() : null,
      },
    })
    if (attempts >= MAX_ATTEMPTS) {
      createAlert('PIN_LOCKED', 'users', userId, { name: user.name, email: user.email }).catch(() => {})
    }
    return false
  }

  await prisma.user.update({
    where: { id: userId },
    data: { failedPinAttempts: 0, lastLoginAt: new Date() },
  })
  return true
}
