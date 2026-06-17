import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { verifyPin } from '@/lib/auth/pin'
import { createSession, setSessionCookie } from '@/lib/auth/session'
import { rateLimit, clientIp } from '@/lib/rate-limit'

const schema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('pin'), email: z.string().email(), pin: z.string().length(6) }),
  z.object({ mode: z.literal('admin'), email: z.string().email(), password: z.string().min(8) }),
])

// First-layer abuse protection: cap login attempts per source IP. The
// per-account lockout (lib/auth/pin.ts) remains the primary per-credential
// defense; this stops high-volume spraying across many accounts from one IP.
const MAX_LOGINS_PER_IP = 15
const LOGIN_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req)
    const rl = rateLimit(`login:${ip}`, MAX_LOGINS_PER_IP, LOGIN_WINDOW_MS)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a few minutes and try again.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

    const input = parsed.data
    const user = await prisma.user.findUnique({ where: { email: input.email } })

    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    let valid = false

    if (input.mode === 'pin') {
      if (user.role !== 'OPERATOR') return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      valid = await verifyPin(user.id, input.pin)
    } else {
      if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      if (!user.pinHash) return NextResponse.json({ error: 'No password set' }, { status: 401 })
      // Admin passwords are stored in the same hashed column as operator PINs,
      // so verifyPin gives the admin path the identical lockout protection
      // (previously the admin password had no lockout at all).
      valid = await verifyPin(user.id, input.password)
    }

    if (!valid) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })

    const token = await createSession({ userId: user.id, role: user.role, name: user.name, email: user.email })
    await setSessionCookie(token)

    return NextResponse.json({ role: user.role })
  } catch (err) {
    console.error('[auth/login]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
