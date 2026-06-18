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

  const where: Record<string, unknown> = {}
  if (status) where.status = status

  // Non-admins only see transfers involving them
  if (session.role !== 'ADMIN') {
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
