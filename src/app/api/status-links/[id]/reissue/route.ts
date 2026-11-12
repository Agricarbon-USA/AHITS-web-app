import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { generateStatusToken, hashToken, statusLinkUrl } from '@/lib/status-links'

// W0-9 / REQ-D: "Copy link" on Hubs → Inbound. Raw tokens are unrecoverable after
// issuance by design, so the same HUB_RETURN link gets a new address (a new token,
// 14 days from now) and the URL comes back for an admin to copy to a hub that has no
// contact email. The row, its state, its discrepancy flag and its history stay; an
// address copied earlier stops opening. A received or dismissed link answers 409.
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

  // The same link gets a new address. Its row, state, discrepancy flag and history stay.
  const rawToken = generateStatusToken()
  const turned = await prisma.statusLink.updateMany({
    where: { id, state: { in: ['ISSUED', 'VIEWED', 'ACTED'] } },
    data: { tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) }, // 14 days, as a new link
  })
  if (turned.count === 0) {
    return NextResponse.json({ error: 'This return is already received or dismissed.' }, { status: 409 })
  }
  return NextResponse.json({ ok: true, url: statusLinkUrl(rawToken) })
}
