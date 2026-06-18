import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireAdmin } from '@/lib/auth/session'
import { computeUnitCounts, deriveQuantities, categoryDisplay, withPositions } from '@/lib/inventory'

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

  return NextResponse.json({
    data: {
      ...rest,
      units: withPositions(item.units),
      category: categoryDisplay(item),
      unitCounts,
      // Derived single-source-of-truth quantities (units for serialized, stored count for consumables)
      derivedQuantity: derived.effectiveQuantity,
      availableQuantity: derived.availableQuantity,
      currentOperator: activeRig?.operator ?? null,
      currentProject: activeRig?.project ?? null,
    },
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  try {
    const body = await req.json()
    const { categoryId, hubId, ...rest } = body
    const updateData: Record<string, unknown> = { ...rest }
    // Skip categoryId/hubId if falsy or if they look like enum values (e.g. 'SAMPLING_EQUIPMENT')
    // rather than real CUIDs — avoids a Prisma FK error when items have enum-fallback categories
    if (categoryId && typeof categoryId === 'string' && !/^[A-Z_]+$/.test(categoryId)) {
      updateData.categoryId = categoryId
    }
    if (hubId && typeof hubId === 'string' && !/^[A-Z_]+$/.test(hubId)) {
      updateData.hubId = hubId
    }
    const item = await prisma.inventoryItem.update({ where: { id }, data: updateData as never })
    return NextResponse.json({ data: item })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  await prisma.inventoryItem.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
