import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { verifyPin } from '@/lib/auth/pin'
import { createSession, setSessionCookie } from '@/lib/auth/session'
import bcrypt from 'bcryptjs'

const schema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('pin'), email: z.string().email(), pin: z.string().length(6) }),
  z.object({ mode: z.literal('admin'), email: z.string().email(), password: z.string().min(8) }),
])

export async function POST(req: NextRequest) {
  try {
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
      valid = await bcrypt.compare(input.password, user.pinHash)
      if (valid) {
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      }
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
