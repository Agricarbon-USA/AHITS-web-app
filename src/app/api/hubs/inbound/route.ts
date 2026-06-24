import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'

// M6: admin oversight of what's in-transit / awaiting receipt at each hub —
// every non-terminal HUB_RETURN status link, grouped by hub, with discrepancy
// flags. Read-only, admin-only. The external login-less hub portal is a separate
// follow-on; this is the internal "what are we waiting on" view.
export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const links = await prisma.statusLink.findMany({
    where: { type: 'HUB_RETURN', state: { in: ['ISSUED', 'VIEWED', 'ACTED'] } },
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
        where: { action: 'DISCREPANCY' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { note: true, actorLabel: true, createdAt: true },
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

  type Unit = {
    statusLinkId: string
    unitId: string | null
    itemName: string
    serial: string | null
    state: string
    issuedAt: Date
    viewedAt: Date | null
    expiresAt: Date
    discrepancy: { note: string | null; actorLabel: string; at: Date } | null
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
    const ev = l.events[0]
    group.units.push({
      statusLinkId: l.id,
      unitId: l.inventoryUnitId,
      itemName: l.inventoryUnit?.inventoryItem?.name ?? 'Item',
      serial: l.inventoryUnit?.serialNumber ?? null,
      state: l.state,
      issuedAt: l.createdAt,
      viewedAt: l.viewedAt,
      expiresAt: l.expiresAt,
      discrepancy: ev ? { note: ev.note, actorLabel: ev.actorLabel, at: ev.createdAt } : null,
    })
    hubs.set(key, group)
  }

  const data = [...hubs.values()].sort((a, b) => a.hubName.localeCompare(b.hubName))
  const totalPending = links.length
  const discrepancies = links.filter((l) => l.state === 'ACTED').length
  return NextResponse.json({ data, counts: { totalPending, discrepancies } })
}
