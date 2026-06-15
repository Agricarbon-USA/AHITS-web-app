import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import type { EquipmentCategory, EquipmentStatus, ItemType, HubLocation, Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const page = parseInt(searchParams.get('page') ?? '1')
  const pageSize = parseInt(searchParams.get('pageSize') ?? '25')
  const status = searchParams.get('status') as EquipmentStatus | null
  const category = searchParams.get('category') as EquipmentCategory | null
  const itemType = searchParams.get('itemType') as ItemType | null
  const hubLocation = searchParams.get('hubLocation') as HubLocation | null
  const operatorId = searchParams.get('operatorId')
  const projectId = searchParams.get('projectId')
  const includeRetired = searchParams.get('includeRetired') === 'true'
  const q = searchParams.get('q')

  const where: Prisma.InventoryItemWhereInput = {
    ...(status ? { status } : (!includeRetired ? { status: { not: 'RETIRED' } } : {})),
    ...(category && { category }),
    ...(itemType && { itemType }),
    ...(hubLocation && { hubLocation }),
    ...(q && { name: { contains: q, mode: 'insensitive' as const } }),
  }

  // Filter by active operator or project: find items whose most recent checkout
  // is to the specified operator/project and hasn't been returned yet.
  if (operatorId || projectId) {
    const activeCheckouts = await prisma.checkLog.findMany({
      where: {
        action: 'CHECK_OUT',
        ...(operatorId && { operatorId }),
        ...(projectId && { projectId }),
      },
      orderBy: { submittedAt: 'desc' },
      select: { itemId: true, submittedAt: true },
    })
    // For each unique itemId, verify no CHECK_IN happened after the checkout
    const checkedOutItemIds: string[] = []
    for (const log of activeCheckouts) {
      const hasReturn = await prisma.checkLog.findFirst({
        where: { itemId: log.itemId, action: 'CHECK_IN', submittedAt: { gt: log.submittedAt } },
      })
      if (!hasReturn) checkedOutItemIds.push(log.itemId)
    }
    where.id = { in: checkedOutItemIds }
  }

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { name: 'asc' },
    }),
    prisma.inventoryItem.count({ where }),
  ])

  // For each item, find current operator and project from active checkouts
  const itemIds = items.map((i) => i.id)
  const activeCheckoutLogs = await prisma.checkLog.findMany({
    where: { itemId: { in: itemIds }, action: 'CHECK_OUT' },
    orderBy: { submittedAt: 'desc' },
    include: {
      operator: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, location: true } },
    },
  })

  // Build a map of itemId → active checkout (most recent CHECK_OUT with no return)
  const activeByItem: Record<string, typeof activeCheckoutLogs[0]> = {}
  for (const log of activeCheckoutLogs) {
    if (activeByItem[log.itemId]) continue // already found the most recent
    const hasReturn = await prisma.checkLog.findFirst({
      where: { itemId: log.itemId, action: 'CHECK_IN', submittedAt: { gt: log.submittedAt } },
    })
    if (!hasReturn) activeByItem[log.itemId] = log
  }

  const data = items.map((item) => ({
    ...item,
    currentOperator: activeByItem[item.id]?.operator ?? null,
    currentProject: activeByItem[item.id]?.project ?? null,
  }))

  return NextResponse.json({ data, total, page, pageSize })
}

const createSchema = z.object({
  name: z.string().min(1),
  category: z.string(),
  itemType: z.enum(['SERIALIZED', 'CONSUMABLE']).default('CONSUMABLE'),
  unitId: z.string().optional(),
  quantity: z.number().int().min(0).default(1),
  expectedQuantity: z.number().int().min(0).optional(),
  hubLocation: z.enum(['PIEDMONT_SC', 'WATERLOO_IA']).optional(),
  unitCost: z.number().optional(),
  supplier: z.string().optional(),
  reorderUrl: z.string().url().optional().or(z.literal('')),
  location: z.string().optional(),
  notes: z.string().optional(),
  lowStockThreshold: z.number().int().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const item = await prisma.inventoryItem.create({ data: parsed.data as never })
  return NextResponse.json({ data: item }, { status: 201 })
}
