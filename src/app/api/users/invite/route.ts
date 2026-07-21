import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { sendEmail } from '@/lib/email/resend'
import { inviteEmail } from '@/lib/email/templates'
import { writeAudit } from '@/lib/audit'
import { generateInviteToken, hashInviteToken } from '@/lib/invite-token'

// List outstanding (pending) invites for the admin Team Management view.
export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const invites = await prisma.inviteToken.findMany({
    where: { usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, email: true, name: true, role: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ data: invites })
}

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  role: z.enum(['ADMIN', 'OPERATOR']),
  // Copy-link invites: how the setup link is delivered. EMAIL (default) is the
  // existing behavior, byte-identical. LINK skips email entirely and returns the
  // one-time setup URL for the admin to hand off out-of-band.
  delivery: z.enum(['EMAIL', 'LINK']).default('EMAIL'),
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

  const { name, email, role, delivery } = parsed.data

  // Check if user already exists
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
  }

  // Invalidate any existing pending invite for this email
  await prisma.inviteToken.deleteMany({
    where: { email, usedAt: null },
  })

  // Create 48-hour invite. The raw CSPRNG token goes in the email; only its
  // sha256 hash is persisted (H2).
  const rawToken = generateInviteToken()
  const invite = await prisma.inviteToken.create({
    data: {
      email,
      name,
      role,
      token: hashInviteToken(rawToken),
      createdBy: session.userId,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const setupUrl = `${appUrl}/setup-account?token=${encodeURIComponent(rawToken)}`

  // LINK delivery: no email is sent — return the one-time setup URL for the admin
  // to copy and hand off. Same token/hash/expiry/revoke posture as email invites;
  // the raw token lives only in this response (never persisted, never logged, and
  // deliberately not put in the audit metadata). no-store so the secret URL isn't
  // cached by any intermediary.
  if (delivery === 'LINK') {
    await writeAudit(session.userId, 'INVITE_LINK_CREATED', null, { email, role, inviteId: invite.id })
    return NextResponse.json(
      { ok: true, setupUrl, expiresAt: invite.expiresAt },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  // If the email fails to send, don't leave a dangling invite the admin thinks
  // went out — clean it up and surface the failure.
  try {
    await sendEmail({ kind: 'INVITE',
      to: email,
      subject: `You've been invited to AHITS — Agricarbon`,
      html: inviteEmail(name, role, setupUrl),
    })
  } catch (err) {
    await prisma.inviteToken.delete({ where: { id: invite.id } }).catch(() => {})
    console.error('invite email failed', err)
    return NextResponse.json(
      { error: 'Could not send the invite email. Please try again.' },
      { status: 502 },
    )
  }

  await writeAudit(session.userId, 'INVITE_SENT', null, { email, role, inviteId: invite.id })
  return NextResponse.json({ ok: true, message: `Invite sent to ${email}` }, { status: 201 })
}
