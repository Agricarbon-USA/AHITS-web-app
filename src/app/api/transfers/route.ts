import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'

const TRANSFER_INCLUDE = {
  fromRig: { include: { operator: { select: { id: true, name: true } } } },
  toOperator: { select: { id: true, name: true } },
  vehicles: { include: { vehicle: { select: { id: true, name: true, type: true } } } },
  items: {
    include: {
      kitItem: {
        include: { item: { select: { id: true, name: true } } },
      },
    },
  },
} as const

export async function GET(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const direction = searchParams.get('direction') // 'incoming' | 'outgoing' | null

  const where: Record<string, unknown> = {}
  if (status) where.status = status

  // Direction filters relative to the current user so the operator's
  // "incoming" (Accept/Decline) and "outgoing" (Waiting/Cancel) banners stay
  // distinct. Previously this param was ignored, so the sender's pending banner
  // leaked to the recipient and vice-versa.
  if (direction === 'incoming') {
    where.toOperatorId = session.userId
  } else if (direction === 'outgoing') {
    where.fromRig = { operatorId: session.userId }
  } else if (session.role !== 'ADMIN') {
    // No direction given: non-admins still only see transfers involving them.
    where.OR = [
      { toOperatorId: session.userId },
      { fromRig: { operatorId: session.userId } },
    ]
  }

  const transfers = await prisma.transferRequest.findMany({
    where,
    include: TRANSFER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(transfers)
}
