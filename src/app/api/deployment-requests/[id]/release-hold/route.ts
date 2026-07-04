import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { releaseAllHeldForRequest } from '@/lib/deployment-requests'

// UR-010 (U2): admin escape hatch to release a FULFILLED reservation's still-HELD
// (unclaimed) stock back to free availability — e.g. the operator never checked out,
// or checked out at a different hub (H6) leaving the hold stranded on the origin hub.
// Idempotent: releaseAllHeldForRequest guards each line on `releasedAt IS NULL`, so a
// repeat call, the stale-hold TTL cron, or a later cancel can't double-release.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Admin only.' }, { status: 403 })

  const { id } = await params
  const released = await prisma.$transaction((tx) => releaseAllHeldForRequest(id, tx))
  return NextResponse.json({ ok: true, released })
}
