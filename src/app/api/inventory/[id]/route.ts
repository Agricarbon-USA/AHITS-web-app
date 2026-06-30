import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EquipmentCategory, EquipmentStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireAdmin } from '@/lib/auth/session'
import { writeOr404 } from '@/lib/api-errors'
import { computeUnitCounts, deriveQuantities, categoryDisplay, withPositions } from '@/lib/inventory'
import { money } from '@/lib/validation'

// Whitelist of admin-editable fields. Excludes id/qrCodeId/deletedAt/timestamps
// and the unitId helper to prevent mass-assignment. categoryId/hubId are kept
// but pass through the enum-fallback guard below.
const inventoryUpdateSchema = z
  .object({
    name: z.string().min(1),
    category: z.nativeEnum(EquipmentCategory),
    itemType: z.enum(['SERIALIZED', 'CONSUMABLE']),
    sku: z.string().nullable(),
    quantity: z.number().int(),
    expectedQuantity: z.number().int().nullable(),
    unitCost: money().nullable(),
    reorderUrl: z.string().nullable(),
    supplier: z.string().nullable(),
    status: z.nativeEnum(EquipmentStatus),
    location: z.string().nullable(),
    notes: z.string().nullable(),
    lowStockThreshold: z.number().int().nullable(),
    categoryId: z.string().nullable(),
    hubId: z.string().nullable(),
  })
  .partial()
  .strict()

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: {
      categoryRef: { select: { id: true, name: true } },
      hub: { select: { id: true, name: true, city: true, state: true } },
      units: {
        where: { deletedAt: null },
        select: { id: true, qrCodeId: true, serialNumber: true, status: true, notes: true, createdAt: true },
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
      checkLogs: {
        select: {
          id: true, action: true, condition: true, submittedAt: true, inventoryUnitId: true,
          operator: { select: { id: true, name: true } },
        },
        orderBy: { submittedAt: 'desc' },
      },
      photos: true,
    },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const unitCounts = computeUnitCounts(item.units)
  const derived = deriveQuantities(item, unitCounts)

  const activeKit = item.kitItems.find((ki) => ki.kit.rig !== null && ki.kit.rig.endedAt === null)
  const activeRig = activeKit?.kit.rig ?? null

  const { kitItems, categoryRef, ...rest } = item
  void kitItems
  void categoryRef

  const data: Record<string, unknown> = {
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
  // Cost/spend data is admin-only (§10.2). Strip it for operators.
  if (session.role !== 'ADMIN') delete data.unitCost

  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const parsed = inventoryUpdateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const { categoryId, hubId, ...rest } = parsed.data
  const updateData: Record<string, unknown> = { ...rest }
  // Skip categoryId/hubId if falsy or if they look like enum values (e.g. 'SAMPLING_EQUIPMENT')
  // rather than real CUIDs — avoids a Prisma FK error when items have enum-fallback categories
  if (categoryId && !/^[A-Z_]+$/.test(categoryId)) updateData.categoryId = categoryId
  if (hubId && !/^[A-Z_]+$/.test(hubId)) updateData.hubId = hubId
  try {
    const item = await prisma.inventoryItem.update({ where: { id }, data: updateData as never })
    return NextResponse.json({ data: item })
  } catch {
    return NextResponse.json({ error: 'Item not found or update failed' }, { status: 400 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  // Soft-delete (CR-8): preserve kit/check history instead of FK-erroring.
  const notFound = await writeOr404(
    () => prisma.inventoryItem.update({ where: { id }, data: { deletedAt: new Date() } }),
    'Item not found',
  )
  if (notFound) return notFound
  return NextResponse.json({ ok: true })
}
