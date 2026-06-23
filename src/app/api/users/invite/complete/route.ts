import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hashPin } from '@/lib/auth/pin'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { hashInviteToken } from '@/lib/invite-token'
import bcrypt from 'bcryptjs'

const schema = z.object({
  token: z.string(),
  credential: z.string().min(6), // PIN (6 digits) for operators, password (8+ chars) for admins
})

export async function POST(req: NextRequest) {
  // Throttle this public account-minting endpoint (10 / 10 min / IP).
  const rl = await rateLimit(`invite-complete:${clientIp(req)}`, 10, 10 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { token, credential } = parsed.data
  const tokenHash = hashInviteToken(token) // tokens are stored hashed (H2)

  const invite = await prisma.inviteToken.findUnique({ where: { token: tokenHash } })
  if (!invite || invite.usedAt || invite.revokedAt || invite.expiresAt < new Date()) {
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

  try {
    const completed = await prisma.$transaction(async (tx) => {
      // Atomically claim the invite: only the request that flips usedAt from
      // null wins. This closes the TOCTOU where two concurrent submissions both
      // pass the check above and both try to create the account.
      const claim = await tx.inviteToken.updateMany({
        where: { token: tokenHash, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      })
      if (claim.count === 0) return false

      await tx.user.create({
        data: {
          name: invite.name,
          email: invite.email,
          role: invite.role,
          pinHash: hash,
          isActive: true,
        },
      })
      return true
    })

    if (!completed) {
      return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 410 })
    }
  } catch (err) {
    // Most likely a unique-email collision (account already exists). The invite
    // is rolled back with the transaction, so it remains usable.
    console.error('invite complete failed', err)
    return NextResponse.json(
      { error: 'Could not complete signup. An account with this email may already exist.' },
      { status: 409 },
    )
  }

  return NextResponse.json({ ok: true })
}
