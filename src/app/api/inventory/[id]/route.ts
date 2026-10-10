import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EquipmentCategory, EquipmentStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getDeploymentRoster } from '@/lib/deployment-assignments'
import { requireAuth, requireAdmin } from '@/lib/auth/session'
import { computeUnitCounts, itemCounts, isLiveKitLine, categoryDisplay, withPositions } from '@/lib/inventory'
import { listItemStock } from '@/lib/inventory-stock'
import { money } from '@/lib/validation'
import { deleteItem, restoreFirst, retireUnit } from '@/lib/asset-status'
import { assertNoOpenReferences, openReferences, referenceConflictBody } from '@/lib/asset-references'
import { assertSerialized, assertTypeUnlocked } from '@/lib/item-rules'

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
  // PR-3c: a deleted item is shown (read-only, admin only) with the units deleted with
  // it — the rows carrying its own stamp — so the drawer reads as it will on Restore.
  const stamp = await prisma.inventoryItem.findUnique({ where: { id }, select: { deletedAt: true } })
  if (stamp?.deletedAt && session.role !== 'ADMIN') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: {
      categoryRef: { select: { id: true, name: true } },
      hub: { select: { id: true, name: true, city: true, state: true } },
      deletedBy: { select: { id: true, name: true } },
      units: {
        where: { deletedAt: stamp?.deletedAt ?? null },
        select: { id: true, qrCodeId: true, serialNumber: true, status: true, notes: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
      kitItems: {
        where: { removedAt: null },
        select: {
          quantity: true,
          drawnQuantity: true,
          drawnHubId: true,
          kit: {
            select: {
              rig: {
                select: {
                  id: true,
                  endedAt: true,
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
  // PR-2 (RC-3): the same numbers the list row carries, from the same helper.
  const stockRows = item.itemType === 'CONSUMABLE' ? await listItemStock(item.id) : []
  const counts = itemCounts({
    itemType: item.itemType,
    quantity: item.quantity,
    units: item.units,
    stockRows,
    liveKitLines: item.kitItems.filter(isLiveKitLine),
  })

  const activeKit = item.kitItems.find((ki) => ki.kit.rig !== null && ki.kit.rig.endedAt === null)
  const activeRig = activeKit?.kit.rig ?? null
  // W0-10 PR-4: operator from the assignment roster (sole source; Rig.operatorId dropped).
  const activeRoster = activeRig ? await getDeploymentRoster(activeRig.id) : null
  const currentOperator = activeRoster?.operator ?? null

  const { kitItems, categoryRef, ...rest } = item
  void kitItems
  void categoryRef

  const data: Record<string, unknown> = {
    ...rest,
    units: withPositions(item.units),
    category: categoryDisplay(item),
    unitCounts,
    itemCounts: counts,
    // Kept for existing readers, read off `itemCounts` (same rule as the list).
    derivedQuantity: item.itemType === 'CONSUMABLE' ? counts.onHand : counts.owned,
    availableQuantity: counts.available,
    currentOperator,
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

  const current = await prisma.inventoryItem.findFirst({ where: { id }, select: { status: true, name: true, deletedAt: true, itemType: true } })
  if (!current) return NextResponse.json({ error: 'Item not found or update failed' }, { status: 400 })
  // PR-3c: a deleted item is read-only until it is restored.
  if (current.deletedAt) return NextResponse.json({ error: restoreFirst(current.name) }, { status: 409 })
  // PR-6: only Available and Retired mean anything on an item (the unit PATCH rule);
  // the other statuses belong to units.
  if (rest.status && rest.status !== current.status && !['AVAILABLE', 'RETIRED'].includes(rest.status)) {
    return NextResponse.json({ error: 'Only Available and Retired can be set on an item.' }, { status: 400 })
  }
  const retiring = rest.status === 'RETIRED' && current.status !== 'RETIRED'
  const retyping = rest.itemType !== undefined && rest.itemType !== current.itemType

  try {
    const item = await prisma.$transaction(async (tx) => {
      // PR-6 (D-y): an item's type is fixed once it has any history. Re-sending the
      // same type (the edit form always sends it) is not a change.
      if (retyping) await assertTypeUnlocked(tx, id)
      if (retiring) {
        // PR-6 (D-w): Retire is for serialized gear — checked before the references, so
        // the message names the real reason. Nothing is written.
        await assertSerialized(tx, id, 'retire')
        // PR-3b (D-a · B1): retiring an item retires every unit on hand (AVAILABLE /
        // INOPERABLE) with its QR label released, and is refused — nothing written —
        // while any unit is out, Returning or in repair, any of it is still on a
        // deployment, or it is held for a reservation. Consumable stock rows and the
        // stored quantity stay as history; the low-stock scan skips retired items
        // (PR-2), and the item's open LOW_INVENTORY alerts are resolved here. Nothing
        // is soft-deleted: the item hides behind "Show retired".
        assertNoOpenReferences('item', current.name, await openReferences({ itemId: id }, tx))
        const onHand = await tx.inventoryUnit.findMany({
          where: { inventoryItemId: id, deletedAt: null, status: { in: ['AVAILABLE', 'INOPERABLE'] } },
          select: { id: true },
        })
        for (const u of onHand) await retireUnit(tx, u.id, `Item "${current.name}" retired`)
        await tx.alert.updateMany({
          where: { type: 'LOW_INVENTORY', sourceTable: 'inventory_items', sourceId: { startsWith: `${id}:` }, resolved: false },
          data: { resolved: true, resolvedAt: new Date(), activeKey: null },
        })
      }
      return tx.inventoryItem.update({ where: { id }, data: updateData as never })
    })
    return NextResponse.json({ data: item })
  } catch (err) {
    const conflict = referenceConflictBody(err)
    if (conflict) return NextResponse.json(conflict, { status: 409 })
    return NextResponse.json({ error: 'Item not found or update failed' }, { status: 400 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  // PR-3c (D-o): a reversible soft delete — the item, its units and its schedules leave
  // every list, count, picker and report with one stamp; "Show deleted → Restore"
  // brings them back. Refused (409, naming what is in the way) while anything still
  // points at it. Guard and effect run in one transaction. The response's `deletedAt`
  // is what Undo restores.
  try {
    const deleted = await prisma.$transaction((tx) => deleteItem(tx, id, session.userId))
    if (!deleted) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    return NextResponse.json({ ok: true, deletedAt: deleted.deletedAt })
  } catch (err) {
    const conflict = referenceConflictBody(err)
    if (conflict) return NextResponse.json(conflict, { status: 409 })
    throw err
  }
}
