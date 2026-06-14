import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

const schema = z.object({
  action: z.enum(['CHECK_OUT', 'CHECK_IN']),
  itemId: z.string(),
  projectId: z.string().optional(),
  fromLocation: z.string().optional(),
  toLocation: z.string().optional(),
  condition: z.enum(['GOOD', 'MINOR_DAMAGE', 'NEEDS_REPAIR', 'MISSING_PARTS']).optional(),
  expectedReturn: z.string().datetime().optional(),
  notes: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { action, itemId, ...rest } = parsed.data

  const log = await prisma.$transaction(async (tx) => {
    const newStatus = action === 'CHECK_OUT' ? 'CHECKED_OUT' : 'AVAILABLE'
    await tx.inventoryItem.update({ where: { id: itemId }, data: { status: newStatus } })

    return tx.checkLog.create({
      data: {
        action,
        itemId,
        operatorId: session.userId,
        syncedAt: new Date(),
        ...rest,
        expectedReturn: rest.expectedReturn ? new Date(rest.expectedReturn) : undefined,
      },
    })
  })

  return NextResponse.json({ data: log }, { status: 201 })
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const itemId = searchParams.get('itemId')
  const page = parseInt(searchParams.get('page') ?? '1')
  const pageSize = parseInt(searchParams.get('pageSize') ?? '25')

  const where = {
    ...(itemId && { itemId }),
    ...(session.role === 'OPERATOR' && { operatorId: session.userId }),
  }

  const [data, total] = await Promise.all([
    prisma.checkLog.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { submittedAt: 'desc' },
      include: {
        item: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
    }),
    prisma.checkLog.count({ where }),
  ])

  return NextResponse.json({ data, total, page, pageSize })
}
