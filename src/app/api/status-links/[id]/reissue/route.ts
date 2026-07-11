import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { issueStatusLink } from '@/lib/status-links'

// W0-9: reissue a HUB_RETURN link — revoke the old one and mint a fresh link for
// the same unit/hub, returning the URL so an admin can copy it to a hub that has no
// contact email (raw tokens are unrecoverable after issuance by design). Mirrors the
// reservation resend-link (UR-030) pattern.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const old = await prisma.statusLink.findUnique({
    where: { id },
    select: { id: true, type: true, inventoryUnitId: true, hubId: true },
  })
  if (!old || old.type !== 'HUB_RETURN' || !old.inventoryUnitId) {
    return NextResponse.json({ error: 'Hub-return link not found.' }, { status: 404 })
  }

  // Revoke the old link so only one live link exists per unit at a time.
  await prisma.statusLink.updateMany({
    where: { id, state: { notIn: ['COMPLETED', 'REVOKED'] } },
    data: { state: 'REVOKED', revokedAt: new Date() },
  })
  const { url } = await issueStatusLink({
    type: 'HUB_RETURN',
    createdById: session.userId,
    inventoryUnitId: old.inventoryUnitId,
    hubId: old.hubId ?? undefined,
  })
  return NextResponse.json({ ok: true, url })
}
