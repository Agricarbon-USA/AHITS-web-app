import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hashPin } from '@/lib/auth/pin'
import bcrypt from 'bcryptjs'

const schema = z.object({
  token: z.string(),
  credential: z.string().min(6), // PIN (6 digits) for operators, password (8+ chars) for admins
})

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { token, credential } = parsed.data

  const invite = await prisma.inviteToken.findUnique({ where: { token } })
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 410 })
  }

  // Validate credential format
  if (invite.role === 'OPERATOR' && !/^\d{6}$/.test(credential)) {
    return NextResponse.json({ error: 'PIN must be exactly 6 digits' }, { status: 400 })
  }
  if (invite.role === 'ADMIN' && credential.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const hash = invite.role === 'OPERATOR'
    ? await hashPin(credential)
    : await bcrypt.hash(credential, 12)

  await prisma.$transaction([
    prisma.user.create({
      data: {
        name: invite.name,
        email: invite.email,
        role: invite.role,
        pinHash: hash,
        isActive: true,
      },
    }),
    prisma.inviteToken.update({
      where: { token },
      data: { usedAt: new Date() },
    }),
  ])

  return NextResponse.json({ ok: true })
}
