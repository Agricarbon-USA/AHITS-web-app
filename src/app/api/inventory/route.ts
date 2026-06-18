import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireAdmin } from '@/lib/auth/session'
import type { EquipmentCategory, EquipmentStatus } from '@prisma/client'
import { computeUnitCounts, deriveQuantities, categoryDisplay, withPositions, CONSUMABLE } from '@/lib/inventory'
import { reservedConsumableMap } from '@/lib/consumables'

export async function GET(req: NextRequest) {
  const session = await requireAuth()
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

  // Consumable availability = total owned − quantity currently reserved in open
  // kit items. One grouped query for the whole page (see lib/consumables.ts).
  const reservedMap = await reservedConsumableMap(
    prisma,
    items.filter((i) => i.itemType === CONSUMABLE).map((i) => i.id),
  )

  const data = items.map((item) => {
    const unitCounts = computeUnitCounts(item.units)
    const derived = deriveQuantities(item, unitCounts, reservedMap.get(item.id) ?? 0)

    // Find active rig assignment via kit items
    const activeKit = item.kitItems.find((ki) => ki.kit.rig !== null && ki.kit.rig.endedAt === null)
    const activeRig = activeKit?.kit.rig ?? null

    // Pull unitCost out of the spread — cost/spend data is admin-only (§10.2)
    // and is re-added below only for admins.
    const { kitItems, categoryRef, unitCost, ...rest } = item
    void kitItems
    void categoryRef

    const positionedUnits = withPositions(item.units)

    return {
      ...rest,
      ...(session.role === 'ADMIN' ? { unitCost } : {}),
      units: positionedUnits,
      // The deployment Build-Kit / Add-Items unit pickers select from this list
      // (documented contract in PRD_ADDITIONS_V2). Restored after the Wave-0
      // refactor dropped it, which left the pickers showing "Select a unit…"
      // with no options even when units were available.
      availableUnits: positionedUnits
        .filter((u) => u.status === 'AVAILABLE')
        .map((u) => ({ id: u.id, serialNumber: u.serialNumber, qrCodeId: u.qrCodeId, position: u.position })),
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
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
