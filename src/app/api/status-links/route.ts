import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { listResponse } from '@/lib/validation'

// Hidden cap made honest (L-14): the scoreboard reads the most recent 100 links.
const STATUS_LINKS_PAGE_SIZE = 100

// Admin view of issued status links (the outbound scoreboard). Never returns the
// token (only its hash is stored anyway) — just state + recipient + timestamps.
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const maintenanceTaskId = searchParams.get('maintenanceTaskId')
  const type = searchParams.get('type')

  const where: Record<string, unknown> = {}
  if (maintenanceTaskId) where.maintenanceTaskId = maintenanceTaskId
  if (type) where.type = type

  const [links, total] = await Promise.all([
    prisma.statusLink.findMany({
      where,
      select: {
        id: true, type: true, state: true, maintenanceTaskId: true, inventoryUnitId: true,
        recipientEmail: true, recipientName: true,
        expiresAt: true, viewedAt: true, actedAt: true, completedAt: true, revokedAt: true, createdAt: true,
        // Per-link event trail, honestly capped: the 10 most recent events.
        events: { select: { action: true, actorLabel: true, note: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 10 },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], // L-13: stable tiebreaker
      take: STATUS_LINKS_PAGE_SIZE,
    }),
    prisma.statusLink.count({ where }),
  ])
  return NextResponse.json(listResponse(links, total, { page: 1, pageSize: STATUS_LINKS_PAGE_SIZE }))
}
