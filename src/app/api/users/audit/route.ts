import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'

// Account activity log (Wave 2A.5 §B.4). Admin-only, append-only, read here.
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const targetUserId = req.nextUrl.searchParams.get('targetUserId')
  const take = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '100') || 100, 500)

  const logs = await prisma.accountAuditLog.findMany({
    where: targetUserId ? { targetUserId } : undefined,
    take,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, action: true, metadata: true, createdAt: true,
      actor: { select: { id: true, name: true } },
      targetUser: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json({ data: logs })
}
