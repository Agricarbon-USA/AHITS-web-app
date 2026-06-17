import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import type { ItemType, Prisma } from '@prisma/client'

function computeUnitCounts(units: { status: string }[]) {
  return {
    totalUnits: units.length,
    available:     units.filter((u) => u.status === 'AVAILABLE').length,
    checkedOut:    units.filter((u) => u.status === 'CHECKED_OUT').length,
    inMaintenance: units.filter((u) => u.status === 'IN_MAINTENANCE').length,
    inoperable:    units.filter((u) => u.status === 'INOPERABLE').length,
    retired:       units.filter((u) => u.status === 'RETIRED').length,
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const page = parseInt(searchParams.get('page') ?? '1')
  const pageSize = parseInt(searchParams.get('pageSize') ?? '25')
  const categoryId = searchParams.get('categoryId')
  const itemType = searchParams.get('itemType') as ItemType | null
  const hubId = searchParams.get('hubId')
  const operatorId = searchParams.get('operatorId')
  const projectId = searchParams.get('projectId')
  const q = searchParams.get('q')

  const where: Prisma.InventoryItemWhereInput = {
    deletedAt: null,
    ...(categoryId && { categoryId }),
    ...(itemType && { itemType }),
    ...(hubId && { hubId }),
    ...(q && { name: { contains: q, mode: 'insensitive' as const } }),
  }

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

    const checkoutItemIds = [...new Set(activeCheckouts.map((l) => l.itemId))]
    const checkins = await prisma.checkLog.findMany({
      where: { itemId: { in: checkoutItemIds }, action: 'CHECK_IN' },
      select: { itemId: true, submittedAt: true },
    })

    const seen = new Set<string>()
    const checkedOutItemIds: string[] = []
    for (const log of activeCheckouts) {
      if (seen.has(log.itemId)) continue
      seen.add(log.itemId)
      const wasReturned = checkins.some(
        (ci) => ci.itemId === log.itemId && ci.submittedAt > log.submittedAt
      )
      if (!wasReturned) checkedOutItemIds.push(log.itemId)
    }
    where.id = { in: checkedOutItemIds }
  }

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { name: 'asc' },
      include: {
        category: true,
        hub: true,
        units: {
          where: { deletedAt: null },
          select: { id: true, status: true, qrCodeId: true, serialNumber: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
    prisma.inventoryItem.count({ where }),
  ])

  const itemIds = items.map((i) => i.id)

  const checkoutLogs = await prisma.checkLog.findMany({
    where: { itemId: { in: itemIds }, action: 'CHECK_OUT' },
    orderBy: { submittedAt: 'desc' },
    include: {
      operator: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, location: true } },
    },
  })

  const checkinLogs = await prisma.checkLog.findMany({
    where: { itemId: { in: itemIds }, action: 'CHECK_IN' },
    select: { itemId: true, submittedAt: true },
  })

  const activeByItem: Record<string, typeof checkoutLogs[0]> = {}
  for (const log of checkoutLogs) {
    if (activeByItem[log.itemId]) continue
    const wasReturned = checkinLogs.some(
      (ci) => ci.itemId === log.itemId && ci.submittedAt > log.submittedAt
    )
    if (!wasReturned) activeByItem[log.itemId] = log
  }

  const data = items.map((item) => {
    const allUnits = item.units
    const unitsWithPosition = allUnits.map((u, i) => ({ ...u, position: i + 1 }))
    const counts = computeUnitCounts(allUnits)
    return {
      ...item,
      unitCounts: counts,
      availableUnits: unitsWithPosition
        .filter((u) => u.status === 'AVAILABLE')
        .map((u) => ({ id: u.id, serialNumber: u.serialNumber, qrCodeId: u.qrCodeId, position: u.position })),
      currentOperator: activeByItem[item.id]?.operator ?? null,
      currentProject: activeByItem[item.id]?.project ?? null,
    }
  })

  return NextResponse.json({ data, total, page, pageSize })
}

const createSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string().min(1),
  hubId: z.string().optional(),
  itemType: z.enum(['SERIALIZED', 'CONSUMABLE']).default('CONSUMABLE'),
  unitId: z.string().optional(),
  quantity: z.number().int().min(0).default(1),
  expectedQuantity: z.number().int().min(0).optional(),
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

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.inventoryItem.create({
      data: parsed.data as never,
    })
    if (parsed.data.quantity > 0) {
      await tx.inventoryUnit.createMany({
        data: Array.from({ length: parsed.data.quantity }, (_, i) => ({
          inventoryItemId: created.id,
          serialNumber: i === 0 ? (parsed.data.unitId ?? null) : null,
        })),
      })
    }
    return tx.inventoryItem.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        category: true,
        hub: true,
        units: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
  })

  return NextResponse.json({
    data: {
      ...item,
      unitCounts: computeUnitCounts(item.units),
    },
  }, { status: 201 })
}
