import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'

// Immediately invalidate a status link. Only links that aren't already terminal
// can be revoked; revocation takes effect at once (no session to expire).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  // Read before revoking so we can reset unit status for HUB_RETURN links.
  const link = await prisma.statusLink.findUnique({
    where: { id },
    select: { type: true, inventoryUnitId: true },
  })

  const revoked = await prisma.statusLink.updateMany({
    where: { id, state: { notIn: ['COMPLETED', 'REVOKED'] } },
    data: { state: 'REVOKED', revokedAt: new Date() },
  })
  if (revoked.count === 0) {
    return NextResponse.json({ error: 'Link cannot be revoked (already completed or revoked).' }, { status: 409 })
  }

  // A revoked HUB_RETURN link means the hub will never confirm receipt via this link.
  // Flip the unit from IN_TRANSIT back to AVAILABLE so it doesn't strand indefinitely.
  if (link?.type === 'HUB_RETURN' && link.inventoryUnitId) {
    await prisma.inventoryUnit.updateMany({
      where: { id: link.inventoryUnitId, status: 'IN_TRANSIT' },
      data: { status: 'AVAILABLE' },
    })
  }

  return NextResponse.json({ ok: true })
}
