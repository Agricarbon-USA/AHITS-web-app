import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import type { EquipmentCategory, EquipmentStatus } from '@prisma/client'
import { computeUnitCounts, deriveQuantities, categoryDisplay, withPositions } from '@/lib/inventory'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const page = parseInt(searchParams.get('page') ?? '1')
  const pageSize = parseInt(searchParams.get('pageSize') ?? '25')
  const status = searchParams.get('status') as EquipmentStatus | null
  const category = searchParams.get('category') as EquipmentCategory | null
  const categoryId = searchParams.get('categoryId')
  const itemType = searchParams.get('itemType')
  const hubId = searchParams.get('hubId')
  const operatorId = searchParams.get('operatorId')
  const projectId = searchParams.get('projectId')
  // Accept both 'q' and 'search' for backward compat
  const q = searchParams.get('q') ?? searchParams.get('search')

  const where = {
    deletedAt: null,
    ...(status && { status }),
    ...(category && { category }),
    ...(categoryId && { categoryId }),
    ...(itemType && { itemType }),
    ...(hubId && { hubId }),
    ...(q && { name: { contains: q, mode: 'insensitive' as const } }),
    // Filter by active operator/project via kit items → kit → rig
    ...((operatorId || projectId) && {
      kitItems: {
        some: {
          removedAt: null,
          kit: {
            rig: {
              endedAt: null,
              ...(operatorId && { operatorId }),
              ...(projectId && { projectId }),
            },
          },
        },
      },
    }),
  }

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { name: 'asc' },
      include: {
        categoryRef: { select: { id: true, name: true } },
        hub: { select: { id: true, name: true, city: true, state: true } },
        units: {
          where: { deletedAt: null },
          select: {
            id: true,
            qrCodeId: true,
            serialNumber: true,
            status: true,
            notes: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        kitItems: {
          where: { removedAt: null },
          select: {
            kit: {
              select: {
                rig: {
                  select: {
                    endedAt: true,
                    operator: { select: { id: true, name: true } },
                    project: { select: { id: true, name: true, location: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.inventoryItem.count({ where }),
  ])

  const data = items.map((item) => {
    const unitCounts = computeUnitCounts(item.units)
    const derived = deriveQuantities(item, unitCounts)

    // Find active rig assignment via kit items
    const activeKit = item.kitItems.find((ki) => ki.kit.rig !== null && ki.kit.rig.endedAt === null)
    const activeRig = activeKit?.kit.rig ?? null

    const { kitItems, categoryRef, ...rest } = item
    void kitItems
    void categoryRef

    return {
      ...rest,
      units: withPositions(item.units),
      category: categoryDisplay(item),
      unitCounts,
      // Derived single-source-of-truth quantities (units for serialized, stored count for consumables)
      derivedQuantity: derived.effectiveQuantity,
      availableQuantity: derived.availableQuantity,
      currentOperator: activeRig?.operator ?? null,
      currentProject: activeRig?.project ?? null,
    }
  })

  return NextResponse.json({ data, total, page, pageSize })
}

const createSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string().optional(),
  itemType: z.string().optional(),
  unitId: z.string().optional(),
  quantity: z.number().int().min(0).default(1),
  expectedQuantity: z.number().int().optional(),
  unitCost: z.number().optional(),
  supplier: z.string().optional(),
  reorderUrl: z.string().url().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  lowStockThreshold: z.number().int().optional(),
  hubId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { categoryId, hubId, ...rest } = parsed.data
  const item = await prisma.inventoryItem.create({
    data: {
      ...rest,
      // Only connect real CUID references, not enum-style fallbacks
      ...(categoryId && !/^[A-Z_]+$/.test(categoryId) && { categoryId }),
      ...(hubId && !/^[A-Z_]+$/.test(hubId) && { hubId }),
    } as never,
  })
  return NextResponse.json({ data: item }, { status: 201 })
}
