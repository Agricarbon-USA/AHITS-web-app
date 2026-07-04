import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────
// Multi-hub inventory stock — data-access layer (workplan §2.2, EXPAND slice).
//
// One `inventory_stock` row per (item, hub) holds a consumable item's quantity
// at that hub. Accessed via raw SQL so it needs no generated-client regen
// (same discipline as lib/deployment-assignments.ts). This layer is the seam
// the follow-on MIGRATE slice will wire checkout/return/low-stock through; it is
// imported by nothing live yet, so adding it is regression-safe.
//
// Concurrency: drawFromHub uses a single guarded UPDATE (quantity >= qty) so a
// race cannot oversell — the row that loses returns 0 affected rows. restoreToHub
// upserts. This matches the guarded-updateMany pattern used for the legacy
// single-hub consumable draw (CR-1).
// ─────────────────────────────────────────────────────────────────────────

type RawClient = Pick<typeof prisma, '$executeRaw' | '$queryRaw'>

export interface ItemStockRow {
  hubId: string
  hubName: string | null
  quantity: number
  reservedQty: number
  available: number
}

/** Per-hub stock for one item (only hubs that have a row), hub-name sorted. */
export async function listItemStock(itemId: string, db: RawClient = prisma): Promise<ItemStockRow[]> {
  const rows = await db.$queryRaw<{ hubId: string; hubName: string | null; quantity: bigint | number; reservedQty: bigint | number; available: bigint | number }[]>`
    SELECT s."hubId", h."name" AS "hubName", s."quantity", s."reservedQty",
           GREATEST(s."quantity" - s."reservedQty", 0) AS "available"
    FROM "inventory_stock" s
    LEFT JOIN "hubs" h ON h."id" = s."hubId"
    WHERE s."itemId" = ${itemId}
    ORDER BY h."name" ASC NULLS LAST
  `
  return rows.map((r) => ({
    hubId: r.hubId,
    hubName: r.hubName,
    quantity: Number(r.quantity),
    reservedQty: Number(r.reservedQty),
    available: Number(r.available),
  }))
}

/** Per-hub stock for many items in one query, keyed by itemId. */
export async function listStockForItems(
  itemIds: string[],
  db: RawClient = prisma,
): Promise<Map<string, ItemStockRow[]>> {
  const map = new Map<string, ItemStockRow[]>()
  if (itemIds.length === 0) return map
  const rows = await db.$queryRaw<({ itemId: string; hubId: string; hubName: string | null; quantity: bigint | number; reservedQty: bigint | number; available: bigint | number })[]>`
    SELECT s."itemId", s."hubId", h."name" AS "hubName", s."quantity", s."reservedQty",
           GREATEST(s."quantity" - s."reservedQty", 0) AS "available"
    FROM "inventory_stock" s
    LEFT JOIN "hubs" h ON h."id" = s."hubId"
    WHERE s."itemId" IN (${Prisma.join(itemIds)})
    ORDER BY h."name" ASC NULLS LAST
  `
  for (const r of rows) {
    const list = map.get(r.itemId) ?? []
    list.push({ hubId: r.hubId, hubName: r.hubName, quantity: Number(r.quantity), reservedQty: Number(r.reservedQty), available: Number(r.available) })
    map.set(r.itemId, list)
  }
  return map
}

/** Quantity of an item at one hub (0 if no row). */
export async function getStockAtHub(itemId: string, hubId: string, db: RawClient = prisma): Promise<number> {
  const rows = await db.$queryRaw<{ quantity: number }[]>`
    SELECT "quantity" FROM "inventory_stock" WHERE "itemId" = ${itemId} AND "hubId" = ${hubId}
  `
  return rows[0]?.quantity ?? 0
}

/** Total stock for an item summed across all hubs. */
export async function totalStock(itemId: string, db: RawClient = prisma): Promise<number> {
  const rows = await db.$queryRaw<{ total: bigint | number | null }[]>`
    SELECT COALESCE(SUM("quantity"), 0) AS "total" FROM "inventory_stock" WHERE "itemId" = ${itemId}
  `
  return Number(rows[0]?.total ?? 0)
}

/**
 * Set (create or overwrite) an item's stock at a hub. Admin edit primitive.
 * UR-010 H4: an overwrite can never drop `quantity` below the hub's committed
 * `reservedQty` — doing so would break the invariant `quantity >= reservedQty` and
 * let a subsequent claim/draw underflow. The DO UPDATE floors the new value at the
 * existing reservedQty (you cannot have less physical stock than you've promised);
 * on a fresh row reservedQty defaults to 0 so the floor is a no-op.
 */
export async function setStockAtHub(itemId: string, hubId: string, quantity: number, db: RawClient = prisma): Promise<void> {
  await db.$executeRaw`
    INSERT INTO "inventory_stock" ("id", "itemId", "hubId", "quantity", "updatedAt")
    VALUES (${randomUUID()}, ${itemId}, ${hubId}, ${Math.max(0, quantity)}, now())
    ON CONFLICT ("itemId", "hubId") DO UPDATE
      SET "quantity" = GREATEST(${Math.max(0, quantity)}, "inventory_stock"."reservedQty"), "updatedAt" = now()`
}

/** Available quantity of an item at one hub, accounting for reserves (quantity - reservedQty). */
export async function availableAtHub(itemId: string, hubId: string, db: RawClient = prisma): Promise<number> {
  const rows = await db.$queryRaw<{ available: bigint | number | null }[]>`
    SELECT GREATEST("quantity" - "reservedQty", 0) AS "available"
    FROM "inventory_stock"
    WHERE "itemId" = ${itemId} AND "hubId" = ${hubId}
  `
  return Number(rows[0]?.available ?? 0)
}

/**
 * Draw `qty` from a hub's stock. Guarded: only succeeds if the hub holds at
 * least `qty` net of reserves (cannot oversell or go negative). Returns the
 * amount actually drawn (== qty on success, 0 if insufficient).
 */
export async function drawFromHub(itemId: string, hubId: string, qty: number, db: RawClient = prisma): Promise<number> {
  if (qty <= 0) return 0
  const n = await db.$executeRaw`
    UPDATE "inventory_stock" SET "quantity" = "quantity" - ${qty}, "updatedAt" = now()
    WHERE "itemId" = ${itemId} AND "hubId" = ${hubId}
      AND "quantity" - "reservedQty" >= ${qty}`
  return Number(n) > 0 ? qty : 0
}

/**
 * UR-010: draw `qty` that is ALREADY reserved for this operator — decrement
 * quantity AND reservedQty together in one guarded UPDATE (the reserve→draw
 * conversion at claim/checkout). Guarded on BOTH `quantity >= qty` and
 * `reservedQty >= qty` so it can never drive either negative; a shortfall returns 0,
 * which the caller MUST treat as an invariant breach and roll back (never free-draw).
 * Unlike drawFromHub this does NOT respect the `quantity - reservedQty` available
 * floor, because the qty being drawn is itself part of the reservedQty being released.
 */
export async function drawReservedFromHub(itemId: string, hubId: string, qty: number, db: RawClient = prisma): Promise<number> {
  if (qty <= 0) return 0
  const n = await db.$executeRaw`
    UPDATE "inventory_stock"
    SET "quantity" = "quantity" - ${qty}, "reservedQty" = "reservedQty" - ${qty}, "updatedAt" = now()
    WHERE "itemId" = ${itemId} AND "hubId" = ${hubId}
      AND "quantity" >= ${qty} AND "reservedQty" >= ${qty}`
  return Number(n) > 0 ? qty : 0
}

/**
 * Re-sync `InventoryItem.quantity` to the SUM across all `inventory_stock` rows.
 * Call inside the same transaction as any stock mutation to preserve the dual-write
 * invariant (MH-2 set/move; create-gap seed).
 */
export async function resyncItemTotal(itemId: string, db: RawClient = prisma): Promise<void> {
  await db.$executeRaw`
    UPDATE "inventory_items"
    SET "quantity" = (
      SELECT COALESCE(SUM("quantity"), 0) FROM "inventory_stock" WHERE "itemId" = ${itemId}
    ), "updatedAt" = now()
    WHERE "id" = ${itemId}
  `
}

/**
 * Soft-reserve `qty` at a hub by incrementing reservedQty. Guarded: only succeeds
 * if (quantity - reservedQty) >= qty so available stock can cover the ask.
 * Returns true on success, false if insufficient available stock (no change made).
 */
export async function reserveAtHub(itemId: string, hubId: string, qty: number, db: RawClient = prisma): Promise<boolean> {
  if (qty <= 0) return true
  const n = await db.$executeRaw`
    UPDATE "inventory_stock"
    SET "reservedQty" = "reservedQty" + ${qty}, "updatedAt" = now()
    WHERE "itemId" = ${itemId} AND "hubId" = ${hubId}
      AND ("quantity" - "reservedQty") >= ${qty}
  `
  return Number(n) > 0
}

/**
 * Release a prior reserve by decrementing reservedQty, floored at 0 to prevent
 * negatives from any race. Always succeeds (no-op if the row is absent).
 */
export async function releaseAtHub(itemId: string, hubId: string, qty: number, db: RawClient = prisma): Promise<void> {
  if (qty <= 0) return
  await db.$executeRaw`
    UPDATE "inventory_stock"
    SET "reservedQty" = GREATEST("reservedQty" - ${qty}, 0), "updatedAt" = now()
    WHERE "itemId" = ${itemId} AND "hubId" = ${hubId}
  `
}

/** Restore `qty` to a hub's stock (creates the row if absent). For genuine good returns. */
export async function restoreToHub(itemId: string, hubId: string, qty: number, db: RawClient = prisma): Promise<void> {
  if (qty <= 0) return
  await db.$executeRaw`
    INSERT INTO "inventory_stock" ("id", "itemId", "hubId", "quantity", "updatedAt")
    VALUES (${randomUUID()}, ${itemId}, ${hubId}, ${qty}, now())
    ON CONFLICT ("itemId", "hubId") DO UPDATE SET "quantity" = "inventory_stock"."quantity" + ${qty}, "updatedAt" = now()`
}

export interface HubStockScanRow {
  itemId: string
  itemName: string | null
  hubId: string
  hubName: string | null
  quantity: number
  threshold: number
}

/**
 * All (item, hub) stock rows for consumable items that have a lowStockThreshold.
 * Returns both low AND healthy rows so the cron scan can raise AND clear alerts
 * in one pass.
 */
export async function allHubStockForScan(db: RawClient = prisma): Promise<HubStockScanRow[]> {
  return db.$queryRaw<HubStockScanRow[]>`
    SELECT s."itemId", i."name" AS "itemName", s."hubId", h."name" AS "hubName",
           s."quantity", i."lowStockThreshold" AS "threshold"
    FROM "inventory_stock" s
    JOIN "inventory_items" i ON i."id" = s."itemId"
    LEFT JOIN "hubs" h ON h."id" = s."hubId"
    WHERE i."deletedAt" IS NULL
      AND i."lowStockThreshold" IS NOT NULL
      AND i."itemType" = 'CONSUMABLE'
    ORDER BY s."quantity" ASC
  `
}

export interface LowStockHubRow {
  itemId: string
  itemName: string | null
  hubId: string
  hubName: string | null
  quantity: number
  threshold: number
}

/**
 * Per-hub low-stock rows: a hub's stock at or below the item's lowStockThreshold.
 * The follow-on MIGRATE slice routes these through the notification dispatcher as
 * per-hub LOW_INVENTORY alerts (replacing the single-hub item-level scan).
 */
export async function lowStockByHub(db: RawClient = prisma): Promise<LowStockHubRow[]> {
  return db.$queryRaw<LowStockHubRow[]>`
    SELECT s."itemId", i."name" AS "itemName", s."hubId", h."name" AS "hubName",
           s."quantity", i."lowStockThreshold" AS "threshold"
    FROM "inventory_stock" s
    JOIN "inventory_items" i ON i."id" = s."itemId"
    LEFT JOIN "hubs" h ON h."id" = s."hubId"
    WHERE i."deletedAt" IS NULL
      AND i."lowStockThreshold" IS NOT NULL
      AND s."quantity" <= i."lowStockThreshold"
    ORDER BY s."quantity" ASC
  `
}
