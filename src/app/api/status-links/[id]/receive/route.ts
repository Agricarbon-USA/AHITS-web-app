import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'
import { resolveStatusLinkById, applyTransition } from '@/lib/status-links'

// W0-9: admin fallback for hubs with no contact email (both staging hubs) — mark a
// HUB_RETURN link received on the hub's behalf, reusing the same RECEIVED transition
// (and its sibling-completion + unit flip) with an attributable admin actor.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const link = await resolveStatusLinkById(id)
  if (!link || link.type !== 'HUB_RETURN') {
    return NextResponse.json({ error: 'Hub-return link not found.' }, { status: 404 })
  }
  const result = await applyTransition(link, { action: 'RECEIVED', actorLabel: `Admin: ${session.name}` })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, state: result.state })
}
