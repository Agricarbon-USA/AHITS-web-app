import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { verifyPin, hashPin } from '@/lib/auth/pin'
import { pinSchema } from '@/lib/validation'

// Operator self-service PIN change (N-PIN). Also the screen that satisfies a
// forced reset: setting a new PIN clears mustChangePin. Authenticated — the
// caller changes their OWN PIN; admins reset others via the users API.
const schema = z.object({
  currentPin: z.string().min(1, 'Enter your current PIN'),
  newPin: pinSchema,
})

export async function POST(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const { currentPin, newPin } = parsed.data

  if (newPin === currentPin) {
    return NextResponse.json({ error: 'New PIN must be different from your current PIN.' }, { status: 400 })
  }

  // verifyPin enforces the same per-account lockout as login, so brute-forcing
  // the current PIN here is bounded too.
  const ok = await verifyPin(session.userId, currentPin)
  if (!ok) {
    return NextResponse.json({ error: 'Current PIN is incorrect.' }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { pinHash: await hashPin(newPin), mustChangePin: false, failedPinAttempts: 0, pinLockedAt: null },
  })

  return NextResponse.json({ ok: true })
}
