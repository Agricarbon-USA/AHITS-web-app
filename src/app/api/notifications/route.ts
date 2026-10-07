import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { listResponse } from '@/lib/validation'

// Current user's recent notifications + unread count (drives the bell badge).
//
// PR-1a (L-5): the list is hard-capped at 30 but the badge counts every unread
// row, so the two disagreed and nothing said so. The envelope now carries the
// REAL total and `truncated: true` whenever rows are being withheld. The bell's
// "N unread · showing 30" + Load more is PR-1b; this is the honest number it reads.
const BELL_PAGE_SIZE = 30

export async function GET() {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [data, unread, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.userId },
      // L-13: stable tiebreaker — two notifications minted in the same millisecond
      // would otherwise be free to swap places between reads.
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: BELL_PAGE_SIZE,
    }),
    prisma.notification.count({ where: { userId: session.userId, readAt: null } }),
    prisma.notification.count({ where: { userId: session.userId } }),
  ])

  return NextResponse.json({
    ...listResponse(data, total, { page: 1, pageSize: BELL_PAGE_SIZE }),
    unread,
  })
}
