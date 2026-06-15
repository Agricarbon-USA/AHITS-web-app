import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

const TRANSFER_INCLUDE = {
  fromRig: { include: { operator: { select: { id: true, name: true } } } },
  toOperator: { select: { id: true, name: true } },
  initiatedBy: { select: { id: true, name: true } },
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
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const rawStatus = searchParams.get('status') ?? 'PENDING'
  const direction = searchParams.get('direction')

  const validStatuses = ['PENDING', 'ACCEPTED', 'DECLINED'] as const
  type TStatus = typeof validStatuses[number]
  const status: TStatus = (validStatuses as readonly string[]).includes(rawStatus)
    ? (rawStatus as TStatus)
    : 'PENDING'

  const where: Prisma.TransferRequestWhereInput = { status }

  if (session.role === 'OPERATOR') {
    if (direction === 'incoming') {
      where.toOperatorId = session.userId
    } else if (direction === 'outgoing') {
      where.fromRig = { operatorId: session.userId }
    } else {
      where.OR = [
        { toOperatorId: session.userId },
        { fromRig: { operatorId: session.userId } },
      ]
    }
  }

  const transfers = await prisma.transferRequest.findMany({
    where,
    include: TRANSFER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(transfers)
}
