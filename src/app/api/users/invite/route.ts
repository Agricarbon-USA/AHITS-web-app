import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { sendEmail } from '@/lib/email/resend'
import { inviteEmail } from '@/lib/email/templates'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  role: z.enum(['ADMIN', 'OPERATOR']),
})

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { name, email, role } = parsed.data

  // Check if user already exists
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
  }

  // Invalidate any existing pending invite for this email
  await prisma.inviteToken.deleteMany({
    where: { email, usedAt: null },
  })

  // Create 48-hour invite token
  const invite = await prisma.inviteToken.create({
    data: {
      email,
      name,
      role,
      createdBy: session.userId,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const setupUrl = `${appUrl}/setup-account?token=${invite.token}`

  await sendEmail({
    to: email,
    subject: `You've been invited to AHITS — Agricarbon`,
    html: inviteEmail(name, role, setupUrl),
  })

  return NextResponse.json({ ok: true, message: `Invite sent to ${email}` }, { status: 201 })
}
