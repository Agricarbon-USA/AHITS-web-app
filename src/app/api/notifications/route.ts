import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { listResponse, parsePagination } from '@/lib/validation'

// Current user's recent notifications + unread count (drives the bell badge).
//
// PR-1a (L-5): the list is hard-capped at 30 but the badge counts every unread
// row, so the two disagreed and nothing said so. The envelope now carries the
// REAL total and `truncated: true` whenever rows are being withheld. The bell's
// "N unread · showing 30" + Load more is PR-1b; this is the honest number it reads.
const BELL_PAGE_SIZE = 30

/**
 * PR-1b (L-5): the bell is now PAGED, not hard-capped. PR-1a made the envelope
 * honest — 30 rows of a real total, `truncated: true` — which is what exposed the
 * shape of the problem: the badge counted every unread row while the list showed
 * at most 30, so past 30 the two disagreed and nothing said so. A `page` param is
 * the smallest thing that lets the bell's "Load more" reach the rest.
 */
export async function GET(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { page, pageSize, skip, clamped } = parsePagination(req.nextUrl.searchParams, {
    defaultSize: BELL_PAGE_SIZE,
    maxSize: BELL_PAGE_SIZE,
  })

  const [data, unread, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.userId },
      // L-13: stable tiebreaker — two notifications minted in the same millisecond
      // would otherwise be free to swap places between reads, so "Load more" could
      // skip one row and repeat another.
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip,
      take: pageSize,
    }),
    prisma.notification.count({ where: { userId: session.userId, readAt: null } }),
    prisma.notification.count({ where: { userId: session.userId } }),
  ])

  return NextResponse.json({
    ...listResponse(data, total, { page, pageSize, clamped }),
    unread,
  })
}
