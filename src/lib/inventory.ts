// ─────────────────────────────────────────────────────────────────────────
// Inventory source-of-truth helpers
//
// AHITS tracks two kinds of inventory item, distinguished by `itemType`:
//
//   • SERIALIZED  — each physical unit is an `InventoryUnit` row with its own
//                   QR code and status. The units are the SINGLE SOURCE OF
//                   TRUTH; an item's quantity/availability are DERIVED by
//                   counting unit rows. The stored `InventoryItem.quantity`
//                   column is NOT authoritative for serialized items.
//
//   • CONSUMABLE  — not individually tracked. Per-hub `inventory_stock`
//                   rows are authoritative; the stored `quantity` column is
//                   read only as the legacy fallback inside `itemCounts`.
//
// To prevent the two representations from drifting apart (the historical bug
// where `quantity` was set once at creation and never reconciled with the
// unit rows), all count/quantity/label derivation lives here and nowhere else.
// ─────────────────────────────────────────────────────────────────────────

import type { EquipmentStatus } from '@prisma/client'
import { PICKABLE_STATUSES } from '@/lib/populations'

export const SERIALIZED = 'SERIALIZED'
export const CONSUMABLE = 'CONSUMABLE'

/** Human-readable labels for the EquipmentCategory enum fallback (items with no Category row). */
export const CATEGORY_ENUM_LABELS: Record<string, string> = {
  SAMPLING_EQUIPMENT: 'Sampling Equipment',
  POWER_TOOLS: 'Power Tools',
  HAND_TOOLS: 'Hand Tools',
  SAFETY_GEAR: 'Safety Gear',
  ELECTRONICS_GPS: 'Electronics / GPS',
  STORAGE: 'Storage',
  OTHER: 'Other',
}

/** Resolve an item's display category, preferring a real Category row over the enum fallback. */
export function categoryDisplay(item: {
  categoryRef?: { id: string; name: string } | null
  category: string
}): { id: string; name: string } {
  return (
    item.categoryRef ?? {
      id: item.category,
      name: CATEGORY_ENUM_LABELS[item.category] ?? item.category,
    }
  )
}

// ─────────────────────────────────────────────────────────────────────────
// PR-2 (RC-3): one vocabulary for an item's numbers.
//
// `tally` counts units by status and is typed `Record<EquipmentStatus, number>`,
// so adding a status to the enum fails type-check here instead of the new
// status silently vanishing from every count (which is how IN_TRANSIT units
// came to be in no bucket at all — C-6). `itemCounts` turns a tally (or, for a
// consumable, its stock rows and live kit lines) into the one set of numbers
// every inventory payload carries. Clients render these; they never recount.
// ─────────────────────────────────────────────────────────────────────────

export type StatusTally = Record<EquipmentStatus, number>

export interface UnitTally {
  byStatus: StatusTally
  /** Every unit row passed in, retired included. */
  total: number
  retired: number
  /** In circulation: total − retired. */
  active: number
  /** In `PICKABLE_STATUSES` (D-n): AVAILABLE only until PR-3a. */
  pickable: number
}

/** Count units by status. Callers pass non-deleted units (`deletedAt: null`). */
export function tally(units: ReadonlyArray<{ status: string }>): UnitTally {
  // Exhaustive on purpose: a missing key is a compile error.
  const byStatus: StatusTally = {
    AVAILABLE: 0,
    CHECKED_OUT: 0,
    IN_MAINTENANCE: 0,
    INOPERABLE: 0,
    RETIRED: 0,
    IN_TRANSIT: 0,
  }
  for (const u of units) {
    if (u.status in byStatus) byStatus[u.status as EquipmentStatus] += 1
  }
  const total = units.length
  const retired = byStatus.RETIRED
  const pickable = PICKABLE_STATUSES.reduce((sum, s) => sum + byStatus[s], 0)
  return { byStatus, total, retired, active: total - retired, pickable }
}

export interface ItemCounts {
  /** What the organisation owns and has in circulation. Serialized: active units. Consumable: onHand + out. */
  owned: number
  /** Not on a deployment. */
  onHand: number
  /** Can be picked now. */
  available: number
  /** Held for a request (consumables; serialized reservations do not hold a unit yet — CARRY-10). */
  reserved: number
  /** On a live deployment. */
  out: number
  inMaintenance: number
  inoperable: number
  /** IN_TRANSIT, labelled "Returning": back at the hub, receipt not yet confirmed. */
  inTransit: number
  retired: number
}

export interface KitLineForCount {
  quantity: number
  drawnQuantity: number
  drawnHubId: string | null
}

/**
 * The one set of numbers for an item.
 *
 * SERIALIZED: from `tally` of its (non-deleted) units; `owned` = active units,
 * `available` = pickable units, `out` = CHECKED_OUT. IN_TRANSIT units are on
 * hand at the hub, in their own `inTransit` bucket.
 *
 * CONSUMABLE: `onHand` = Σ stock quantity, `reserved` = Σ reservedQty,
 * `available` = Σ per-hub available (quantity − reserved, floored at 0 per hub,
 * the same figure the pickers gate on), `out` = Σ live kit lines' drawn quantity
 * (a line with no `drawnHubId` predates per-hub draws and counts its `quantity`),
 * `owned` = onHand + out. **Legacy fallback:** an item with no stock rows has
 * never been backfilled, so its stored `quantity` is on hand — exactly what the
 * list and the checkout self-heal already assume. This is the one sanctioned
 * read of `InventoryItem.quantity` outside the drift monitor.
 */
export function itemCounts(input: {
  itemType: string
  quantity: number
  units?: ReadonlyArray<{ status: string }>
  stockRows?: ReadonlyArray<{ quantity: number; reservedQty: number; available: number }>
  liveKitLines?: ReadonlyArray<KitLineForCount>
}): ItemCounts {
  if (input.itemType === SERIALIZED) {
    const t = tally(input.units ?? [])
    const out = t.byStatus.CHECKED_OUT
    return {
      owned: t.active,
      onHand: t.active - out,
      available: t.pickable,
      reserved: 0,
      out,
      inMaintenance: t.byStatus.IN_MAINTENANCE,
      inoperable: t.byStatus.INOPERABLE,
      inTransit: t.byStatus.IN_TRANSIT,
      retired: t.retired,
    }
  }
  const rows = input.stockRows ?? []
  const legacy = rows.length === 0
  const onHand = legacy ? (input.quantity ?? 0) : rows.reduce((s, r) => s + r.quantity, 0)
  const reserved = legacy ? 0 : rows.reduce((s, r) => s + r.reservedQty, 0)
  const available = legacy ? onHand : rows.reduce((s, r) => s + r.available, 0)
  const out = (input.liveKitLines ?? []).reduce(
    (s, l) => s + (l.drawnHubId == null ? l.quantity : l.drawnQuantity),
    0,
  )
  return {
    owned: onHand + out,
    onHand,
    available,
    reserved,
    out,
    inMaintenance: 0,
    inoperable: 0,
    inTransit: 0,
    retired: 0,
  }
}

/** Is this kit line on a deployment that has not ended? (`LIVE_KIT_ITEM`, in memory.) */
export function isLiveKitLine(ki: { removedAt?: Date | null; kit: { rig: { endedAt: Date | null } | null } }): boolean {
  return ki.removedAt == null && ki.kit.rig != null && ki.kit.rig.endedAt === null
}

/**
 * The per-status breakdown the drawer chips and pickers have always read,
 * now derived from `tally` so it cannot disagree with `itemCounts`. `totalUnits`
 * is every row, retired included (the Units tab lists them all).
 */
export type UnitStatusCounts = {
  totalUnits: number
  available: number
  checkedOut: number
  inMaintenance: number
  inoperable: number
  inTransit: number
  retired: number
}

export function computeUnitCounts(units: ReadonlyArray<{ status: string }>): UnitStatusCounts {
  const t = tally(units)
  return {
    totalUnits: t.total,
    available: t.byStatus.AVAILABLE,
    checkedOut: t.byStatus.CHECKED_OUT,
    inMaintenance: t.byStatus.IN_MAINTENANCE,
    inoperable: t.byStatus.INOPERABLE,
    inTransit: t.byStatus.IN_TRANSIT,
    retired: t.retired,
  }
}

/**
 * Attach a stable, 1-based `position` to units that are already ordered by
 * `createdAt` ascending. Position is a human-friendly fallback label
 * ("Unit 3") for units without a serial number, and the same value is used
 * consistently across the admin units table, the deployment unit pickers, and
 * QR lookups.
 */
export function withPositions<T extends { id: string }>(
  unitsOrderedByCreatedAt: ReadonlyArray<T>,
): Array<T & { position: number }> {
  return unitsOrderedByCreatedAt.map((u, idx) => ({ ...u, position: idx + 1 }))
}
