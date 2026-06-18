import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { sendEmail } from '@/lib/email/resend'
import { inviteEmail } from '@/lib/email/templates'
import { writeAudit } from '@/lib/audit'

// Revoke an outstanding invite (Wave 2A.5 §B.3).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const invite = await prisma.inviteToken.findUnique({ where: { id } })
  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  if (invite.usedAt) return NextResponse.json({ error: 'Invite already used' }, { status: 409 })

  await prisma.inviteToken.update({ where: { id }, data: { revokedAt: new Date() } })
  await writeAudit(session.userId, 'INVITE_REVOKED', null, { email: invite.email, inviteId: id })
  return NextResponse.json({ ok: true })
}

// Resend an invite: issue a fresh token + expiry and email it again.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const invite = await prisma.inviteToken.findUnique({ where: { id } })
  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  if (invite.usedAt) return NextResponse.json({ error: 'Invite already used' }, { status: 409 })

  const token = randomBytes(32).toString('base64url')
  const updated = await prisma.inviteToken.update({
    where: { id },
    data: { token, revokedAt: null, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const setupUrl = `${appUrl}/setup-account?token=${encodeURIComponent(updated.token)}`
  try {
    await sendEmail({
      to: updated.email,
      subject: `You've been invited to AHITS — Agricarbon`,
      html: inviteEmail(updated.name, updated.role, setupUrl),
    })
  } catch (err) {
    console.error('invite resend email failed', err)
    return NextResponse.json({ error: 'Could not send the invite email.' }, { status: 502 })
  }

  await writeAudit(session.userId, 'INVITE_RESENT', null, { email: updated.email, inviteId: id })
  return NextResponse.json({ ok: true, message: `Invite resent to ${updated.email}` })
}
