import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import type { StatusLinkState } from '@prisma/client'

// M6: oversight of what's in-transit / awaiting receipt at each hub — every
// non-terminal HUB_RETURN status link, grouped by hub, with discrepancy flags.
// ?filter=resolved returns REVOKED/COMPLETED links for the dismissed/resolved view.
// Read-only. Readable by any authenticated user for operator org-wide read-only
// visibility (workplan §6); receipt/discrepancy actions stay admin-gated.
export async function GET(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const resolved = searchParams.get('filter') === 'resolved'

  const stateFilter: StatusLinkState[] = resolved
    ? ['REVOKED', 'COMPLETED']
    : ['ISSUED', 'VIEWED', 'ACTED']

  const links = await prisma.statusLink.findMany({
    where: { type: 'HUB_RETURN', state: { in: stateFilter } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      state: true,
      hubId: true,
      expiresAt: true,
      createdAt: true,
      viewedAt: true,
      inventoryUnitId: true,
      inventoryUnit: { select: { serialNumber: true, inventoryItem: { select: { name: true } } } },
      hub: { select: { id: true, name: true, city: true, state: true } },
      events: {
        orderBy: { createdAt: 'asc' },
        select: { action: true, note: true, actorLabel: true, createdAt: true },
      },
    },
  })

  // Which hubs have a contact email (raw — newer than the generated client), so
  // the UI can nudge admins to add one where links can't auto-deliver.
  let emailByHub = new Map<string, string | null>()
  try {
    const rows = await prisma.$queryRaw<{ id: string; email: string | null }[]>`SELECT "id", "email" FROM "hubs"`
    emailByHub = new Map(rows.map((r) => [r.id, r.email]))
  } catch { /* column missing pre-migration */ }

  type EventEntry = { action: string; note: string | null; actorLabel: string; at: string }
  type Unit = {
    statusLinkId: string
    unitId: string | null
    itemName: string
    serial: string | null
    state: string
    issuedAt: string
    viewedAt: string | null
    expiresAt: string
    discrepancy: { note: string | null; actorLabel: string; at: string } | null
    allEvents: EventEntry[]
  }
  const hubs = new Map<string, {
    hubId: string | null
    hubName: string
    location: string | null
    email: string | null
    units: Unit[]
  }>()

  for (const l of links) {
    const key = l.hubId ?? '__unassigned__'
    const group = hubs.get(key) ?? {
      hubId: l.hubId,
      hubName: l.hub?.name ?? 'Unassigned hub',
      location: l.hub ? `${l.hub.city}, ${l.hub.state}` : null,
      email: l.hubId ? emailByHub.get(l.hubId) ?? null : null,
      units: [],
    }

    const discrepancyEv = [...l.events].reverse().find((e) => e.action === 'DISCREPANCY')
    const allEvents: EventEntry[] = l.events.map((e) => ({
      action: e.action,
      note: e.note,
      actorLabel: e.actorLabel,
      at: e.createdAt.toISOString(),
    }))

    group.units.push({
      statusLinkId: l.id,
      unitId: l.inventoryUnitId,
      itemName: l.inventoryUnit?.inventoryItem?.name ?? 'Item',
      serial: l.inventoryUnit?.serialNumber ?? null,
      state: l.state,
      issuedAt: l.createdAt.toISOString(),
      viewedAt: l.viewedAt?.toISOString() ?? null,
      expiresAt: l.expiresAt.toISOString(),
      discrepancy: discrepancyEv
        ? { note: discrepancyEv.note, actorLabel: discrepancyEv.actorLabel, at: discrepancyEv.createdAt.toISOString() }
        : null,
      allEvents,
    })
    hubs.set(key, group)
  }

  const data = [...hubs.values()].sort((a, b) => a.hubName.localeCompare(b.hubName))
  const totalPending = resolved ? 0 : links.length
  const discrepancies = resolved ? 0 : links.filter((l) => l.state === 'ACTED').length
  return NextResponse.json({ data, counts: { totalPending, discrepancies } })
}
