import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getDeploymentRostersForDisplay } from '@/lib/deployment-assignments'
import { requireAuth, requireAdmin } from '@/lib/auth/session'
import type { EquipmentCategory, EquipmentStatus, ItemType } from '@prisma/client'
import { computeUnitCounts, itemCounts, isLiveKitLine, categoryDisplay, withPositions } from '@/lib/inventory'
import { money, parsePagination, listResponse } from '@/lib/validation'
import { PICKABLE_STATUSES, PICKABLE_UNIT, LIVE_ITEM, LIVE_KIT_ITEM } from '@/lib/populations'
import { setStockAtHub, resyncItemTotal, listStockForItems } from '@/lib/inventory-stock'
import type { ItemStockRow } from '@/lib/inventory-stock'
import { getActiveProjectsForItems } from '@/lib/project-associations'

/**
 * PR-1b (L-2): the hard ceiling on `mode=options`. A picker is complete or
 * server-searchable, never silently partial (D-h) — but "complete" still needs a
 * floor under the query planner, so past this many rows the response says
 * `truncated: true` and `SearchableSelect` switches to debounced server search.
 * It is deliberately an order of magnitude above the real catalog: the 100-row
 * clamp this PR removes was being hit by an inventory of ~160.
 */
const OPTIONS_CEILING = 1000

/**
 * PR-1b (L-2): the complete pickable set, for every inventory picker in the app.
 *
 * The bug this closes: every picker fetched `/api/inventory?pageSize=100|200`,
 * which `parsePagination` clamps to 100. Item 101 onward could not be packed,
 * reserved, scheduled or field-fixed, and typing its name said "No options" —
 * because the filtering was client-side over a list that never contained it.
 *
 * Deliberately NOT paginated: a picker is a set, not a page. It therefore does
 * not go through `parsePagination` at all — reinstating `take: pageSize` here
 * would rebuild the exact cap this PR exists to remove.
 *
 * Two fields beyond the fix program's literal projection, both to avoid a silent
 * regression at the call sites (noted in the PR body):
 *  - `availableQuantity` — a consumable with no `inventory_stock` rows has an
 *    EMPTY `availableByHub`, so a client-side sum would read 0 and the picker
 *    would show legacy stock as unpickable. Computed here with the same legacy
 *    fallback the paged list already uses.
 *  - `pickableUnits[].qrCodeId` — the operator kit picker's option type carries it.
 */
async function optionsResponse(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q = searchParams.get('q') ?? searchParams.get('search')
  const hubId = searchParams.get('hubId')

  const where = {
    // D-a: a retired item is never pickable. (The paged list hides it behind
    // "Show retired"; a picker has no such door — it simply must not offer it.)
    ...LIVE_ITEM,
    ...(q && { name: { contains: q, mode: 'insensitive' as const } }),
  }

  const items = await prisma.inventoryItem.findMany({
    where,
    // L-13: stable tiebreaker, so `truncated` always cuts the same rows.
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: OPTIONS_CEILING + 1,
    select: {
      id: true,
      name: true,
      itemType: true,
      quantity: true,
      categoryId: true,
      categoryRef: { select: { id: true, name: true } },
      category: true,
      units: {
        // D-n: AVAILABLE only until PR-3a teaches the server to accept an
        // IN_TRANSIT pick. No picker may offer a unit the server would refuse.
        where: PICKABLE_UNIT,
        select: { id: true, qrCodeId: true, serialNumber: true, status: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
      // PR-2: live kit lines, for a consumable's `itemCounts.out`.
      kitItems: {
        where: LIVE_KIT_ITEM,
        select: { quantity: true, drawnQuantity: true, drawnHubId: true },
      },
    },
  })

  const truncated = items.length > OPTIONS_CEILING
  const page = truncated ? items.slice(0, OPTIONS_CEILING) : items

  // Positions are the unit's rank among ALL of the item's units (UXP-6 6d/T8 —
  // the number the inventory drawer shows), so they must be computed over the
  // full unit list, not over the pickable subset alone.
  const serializedIds = page.filter((i) => i.itemType === 'SERIALIZED').map((i) => i.id)
  const allUnits = serializedIds.length
    ? await prisma.inventoryUnit.findMany({
        where: { inventoryItemId: { in: serializedIds }, deletedAt: null },
        select: { id: true, inventoryItemId: true, status: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
    : []
  const unitsByItem = new Map<string, { status: string }[]>()
  for (const u of allUnits) {
    const list = unitsByItem.get(u.inventoryItemId) ?? []
    list.push(u)
    unitsByItem.set(u.inventoryItemId, list)
  }
  const positionByUnitId = new Map<string, number>()
  const seenPerItem = new Map<string, number>()
  for (const u of allUnits) {
    const n = (seenPerItem.get(u.inventoryItemId) ?? 0) + 1
    seenPerItem.set(u.inventoryItemId, n)
    positionByUnitId.set(u.id, n)
  }

  const consumableIds = page.filter((i) => i.itemType === 'CONSUMABLE').map((i) => i.id)
  const stockMap = consumableIds.length
    ? await listStockForItems(consumableIds)
    : new Map<string, ItemStockRow[]>()

  const data = page.map((item) => {
    const stockRows = item.itemType === 'CONSUMABLE' ? (stockMap.get(item.id) ?? []) : []
    const scoped = hubId ? stockRows.filter((r) => r.hubId === hubId) : stockRows
    const counts = itemCounts({
      itemType: item.itemType,
      quantity: item.quantity,
      units: unitsByItem.get(item.id) ?? [],
      stockRows,
      liveKitLines: item.kitItems,
    })
    // Hub-scoped when the item has stock rows (pickers gate on the source hub);
    // otherwise the legacy fallback, which lives in `itemCounts` and nowhere else.
    const availableQuantity = stockRows.length > 0
      ? scoped.reduce((sum, r) => sum + r.available, 0)
      : counts.available

    return {
      id: item.id,
      name: item.name,
      itemType: item.itemType,
      categoryId: item.categoryId ?? null,
      categoryName: item.categoryRef?.name ?? categoryDisplay(item),
      pickableUnits: item.units.map((u) => ({
        id: u.id,
        serialNumber: u.serialNumber,
        qrCodeId: u.qrCodeId,
        status: u.status,
        position: positionByUnitId.get(u.id) ?? 0,
      })),
      availableQuantity,
      availableByHub: stockRows,
      // PR-2: item-wide numbers (not hub-scoped). Pickers keep gating on the
      // source hub through `availableByHub`; these are for display.
      itemCounts: counts,
    }
  })

  return NextResponse.json({ data, total: data.length, truncated, mode: 'options' })
}

export async function GET(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // PR-3c (D-o): "Show deleted" — only deleted items, admins only, and never a picker.
  const deletedView = req.nextUrl.searchParams.get('deleted') === '1'
  if (deletedView) {
    if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (req.nextUrl.searchParams.get('mode') === 'options') {
      return NextResponse.json({ error: 'A picker never offers deleted items.' }, { status: 400 })
    }
  }

  // PR-1b: the picker read is a different question from the admin list read —
  // a complete set rather than a page — so it takes its own path before any
  // pagination is parsed.
  if (req.nextUrl.searchParams.get('mode') === 'options') return optionsResponse(req)

  const { searchParams } = req.nextUrl
  const { page, pageSize, skip, clamped } = parsePagination(searchParams)
  const status = searchParams.get('status') as EquipmentStatus | null
  // PR-1a (D-a, list half): a RETIRED item is out of service, not deleted — it
  // belongs behind a switch, not in the working list. An explicit `status=` filter
  // (including `status=RETIRED`) still wins, so the Retired view and the status
  // deep-links keep working.
  const includeRetired = searchParams.get('includeRetired') === '1'
  const category = searchParams.get('category') as EquipmentCategory | null
  const categoryId = searchParams.get('categoryId')
  const itemType = searchParams.get('itemType')
  const hubId = searchParams.get('hubId')
  const operatorId = searchParams.get('operatorId')
  const projectId = searchParams.get('projectId')
  // Accept both 'q' and 'search' for backward compat
  const q = searchParams.get('q') ?? searchParams.get('search')

  // Rewire the projectId filter off legacy Rig.projectId onto deployment_projects.
  // Run the subquery before the main find so we can use `id: { in: ... }`.
  let projectItemIds: string[] | undefined
  if (projectId) {
    const rows = await prisma.$queryRaw<{ inventoryItemId: string }[]>`
      SELECT DISTINCT ki."inventoryItemId"
      FROM "kit_items" ki
      JOIN "kits" k ON k."id" = ki."kitId"
      JOIN "rigs" r ON r."id" = k."rigId" AND r."endedAt" IS NULL
      JOIN "deployment_projects" dp ON dp."rigId" = r."id" AND dp."removedAt" IS NULL
      WHERE ki."removedAt" IS NULL AND dp."projectId" = ${projectId}
    `
    projectItemIds = rows.map((r) => r.inventoryItemId)
  }

  // W0-10 PR-1: "filter by active operator" via the assignment table (rig's open PRIMARY),
  // not Rig.operatorId.
  let operatorRigIds: string[] = []
  if (operatorId) {
    const arows = await prisma.$queryRaw<{ rigId: string }[]>`
      SELECT a."rigId" FROM "deployment_assignments" a
      JOIN "rigs" r ON r."id" = a."rigId" AND r."endedAt" IS NULL
      WHERE a."operatorId" = ${operatorId} AND a."role" = 'PRIMARY' AND a."endedAt" IS NULL`
    operatorRigIds = arows.map((r) => r.rigId)
  }

  const where = {
    // PR-3c: the deleted view replaces the list (retired or not); every other read stays live-only.
    deletedAt: deletedView ? { not: null } : null,
    ...(status && { status }),
    ...(!status && !includeRetired && !deletedView && { status: { not: 'RETIRED' as const } }),
    ...(category && { category }),
    ...(categoryId && { categoryId }),
    ...(itemType && { itemType: itemType as ItemType }),
    ...(hubId && { hubId }),
    ...(q && { name: { contains: q, mode: 'insensitive' as const } }),
    ...(projectItemIds !== undefined && { id: { in: projectItemIds } }),
    // Filter by active operator via kit items → kit → rig
    ...(operatorId && {
      kitItems: {
        some: {
          removedAt: null,
          kit: { rigId: { in: operatorRigIds } },
        },
      },
    }),
  }

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      skip,
      take: pageSize,
      // L-13: a stable tiebreaker, or two items sharing a name can swap places
      // between pages — one skipped, the other shown twice.
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: {
        categoryRef: { select: { id: true, name: true } },
        hub: { select: { id: true, name: true, city: true, state: true } },
        deletedBy: { select: { id: true, name: true } },
        units: {
          // PR-3c: a deleted item's units are the ones deleted with it (same stamp, below).
          where: { deletedAt: deletedView ? { not: null } : null },
          select: {
            id: true,
            qrCodeId: true,
            serialNumber: true,
            status: true,
            notes: true,
            createdAt: true,
            deletedAt: true,
          },
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
      },
    }),
    prisma.inventoryItem.count({ where }),
  ])

  // Fetch per-hub stock for consumables so all surfaces (picker, admin, checkout)
  // read from the same source (inventory_stock) instead of legacy item.quantity.
  const consumableIds = items.filter((i) => i.itemType === 'CONSUMABLE').map((i) => i.id)
  const stockMap = consumableIds.length > 0
    ? await listStockForItems(consumableIds)
    : new Map<string, ItemStockRow[]>()

  const allItemIds = items.map((i) => i.id)
  const activeProjectsMap = allItemIds.length > 0
    ? await getActiveProjectsForItems(allItemIds)
    : new Map<string, { id: string; name: string }[]>()

  // W0-10 PR-1: each item's active-rig operator from the assignment roster.
  const activeRigIds = items
    .map((i) => i.kitItems.find((ki) => ki.kit.rig !== null && ki.kit.rig.endedAt === null)?.kit.rig?.id)
    .filter((x): x is string => !!x)
  const invRosters = await getDeploymentRostersForDisplay(activeRigIds)

  const data = items.map((raw) => {
    // PR-3c: in the deleted view, only the units that carry the item's own stamp —
    // a unit deleted separately before is not part of what Restore brings back.
    const item = deletedView
      ? { ...raw, units: raw.units.filter((u) => u.deletedAt?.getTime() === raw.deletedAt?.getTime()) }
      : raw
    const unitCounts = computeUnitCounts(item.units)

    // Find active rig assignment via kit items
    const activeKit = item.kitItems.find((ki) => ki.kit.rig !== null && ki.kit.rig.endedAt === null)
    const activeRig = activeKit?.kit.rig ?? null

    // Pull unitCost out of the spread — cost/spend data is admin-only (§10.2)
    // and is re-added below only for admins.
    const { kitItems, categoryRef, unitCost, ...rest } = item
    void kitItems
    void categoryRef

    const positionedUnits = withPositions(item.units)

    // PR-2 (RC-3): the one set of numbers for this item. Every client renders
    // these; none recounts. Consumables read stock rows (legacy fallback to the
    // stored quantity when an item has none) and live kit lines for `out`.
    const stockRows = item.itemType === 'CONSUMABLE' ? (stockMap.get(item.id) ?? []) : []
    const counts = itemCounts({
      itemType: item.itemType,
      quantity: item.quantity,
      units: item.units,
      stockRows,
      liveKitLines: item.kitItems.filter(isLiveKitLine),
    })

    return {
      ...rest,
      ...(session.role === 'ADMIN' ? { unitCost } : {}),
      units: positionedUnits,
      // The deployment Build-Kit / Add-Items unit pickers select from this list
      // (documented contract in PRD_ADDITIONS_V2). Restored after the Wave-0
      // refactor dropped it, which left the pickers showing "Select a unit…"
      // with no options even when units were available.
      availableUnits: positionedUnits
        .filter((u) => (PICKABLE_STATUSES as readonly string[]).includes(u.status))
        .map((u) => ({ id: u.id, serialNumber: u.serialNumber, qrCodeId: u.qrCodeId, position: u.position })),
      category: categoryDisplay(item),
      unitCounts,
      itemCounts: counts,
      // Kept for existing readers, now read off `itemCounts` so they cannot disagree:
      // serialized → active units; consumable → on hand (as before).
      derivedQuantity: item.itemType === 'CONSUMABLE' ? counts.onHand : counts.owned,
      availableQuantity: counts.available,
      // Per-hub stock rows for consumables — used by the operator picker to gate
      // quantity caps on the selected source hub rather than the cross-hub total.
      ...(item.itemType === 'CONSUMABLE' && { hubStock: stockRows }),
      currentOperator: activeRig ? (invRosters.get(activeRig.id)?.operator ?? null) : null,
      currentProject: activeRig?.project ?? null,
      activeProjects: activeProjectsMap.get(item.id) ?? [],
    }
  })

  return NextResponse.json(listResponse(data, total, { page, pageSize, clamped }))
}

const createSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string().optional(),
  itemType: z.string().optional(),
  unitId: z.string().optional(),
  quantity: z.number().int().min(0).default(1),
  expectedQuantity: z.number().int().optional(),
  unitCost: money().optional(),
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
  const realHubId = hubId && !/^[A-Z_]+$/.test(hubId) ? hubId : null
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.inventoryItem.create({
      data: {
        ...rest,
        // Only connect real CUID references, not enum-style fallbacks
        ...(categoryId && !/^[A-Z_]+$/.test(categoryId) && { categoryId }),
        ...(realHubId && { hubId: realHubId }),
      } as never,
    })
    // Seed per-hub stock row for new CONSUMABLE items so MH-2 stock table is populated from creation.
    // resyncItemTotal keeps the dual-write invariant: item.quantity == SUM(stock.quantity).
    if (created.itemType === 'CONSUMABLE' && realHubId && (rest.quantity ?? 0) > 0) {
      await setStockAtHub(created.id, realHubId, rest.quantity ?? 0, tx)
      await resyncItemTotal(created.id, tx)
    }
    return created
  })
  return NextResponse.json({ data: item }, { status: 201 })
}
