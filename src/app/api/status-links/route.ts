import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'

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

  const links = await prisma.statusLink.findMany({
    where,
    select: {
      id: true, type: true, state: true, maintenanceTaskId: true, inventoryUnitId: true,
      recipientEmail: true, recipientName: true,
      expiresAt: true, viewedAt: true, actedAt: true, completedAt: true, revokedAt: true, createdAt: true,
      events: { select: { action: true, actorLabel: true, note: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 10 },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return NextResponse.json({ data: links })
}
