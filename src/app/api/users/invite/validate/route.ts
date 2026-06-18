import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  // Throttle token-guessing on this public endpoint (20 / 10 min / IP).
  const rl = rateLimit(`invite-validate:${clientIp(req)}`, 20, 10 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const invite = await prisma.inviteToken.findUnique({ where: { token } })

  if (!invite) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 })
  if (invite.usedAt) return NextResponse.json({ error: 'This invite has already been used' }, { status: 410 })
  if (invite.revokedAt) return NextResponse.json({ error: 'This invite has been revoked' }, { status: 410 })
  if (invite.expiresAt < new Date()) return NextResponse.json({ error: 'This invite link has expired' }, { status: 410 })

  return NextResponse.json({
    data: { name: invite.name, email: invite.email, role: invite.role },
  })
}
