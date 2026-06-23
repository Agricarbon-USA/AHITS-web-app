import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'

// Immediately invalidate a status link. Only links that aren't already terminal
// can be revoked; revocation takes effect at once (no session to expire).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const revoked = await prisma.statusLink.updateMany({
    where: { id, state: { notIn: ['COMPLETED', 'REVOKED'] } },
    data: { state: 'REVOKED', revokedAt: new Date() },
  })
  if (revoked.count === 0) {
    return NextResponse.json({ error: 'Link cannot be revoked (already completed or revoked).' }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}
