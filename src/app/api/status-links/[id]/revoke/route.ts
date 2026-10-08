import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { revokeHubReturn } from '@/lib/asset-status'

// Immediately invalidate a status link. Only links that aren't already terminal
// can be revoked; revocation takes effect at once (no session to expire).
// Accepts optional { note } body — the note is stored as a DISMISSED event so
// the resolution trail is visible in the resolved filter.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  let note: string | null = null
  try {
    const body = await req.json()
    note = typeof body?.note === 'string' ? body.note.trim().slice(0, 2000) || null : null
  } catch { /* body is optional */ }

  // PR-3a: revoke and, for a HUB_RETURN link, the unit's IN_TRANSIT → AVAILABLE (the hub
  // will never confirm it through this link, so it must not strand) — one transaction.
  const revoked = await prisma.$transaction(async (tx) => {
    const link = await revokeHubReturn(tx, id)
    if (!link) return false
    // Log the dismissal so the resolution trail is queryable.
    await tx.statusLinkEvent.create({
      data: { statusLinkId: id, action: 'DISMISSED', note, actorLabel: `Admin: ${session.name}` },
    })
    return true
  })
  if (!revoked) {
    return NextResponse.json({ error: 'Link cannot be revoked (already completed or revoked).' }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}
