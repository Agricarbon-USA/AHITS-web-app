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
//   • CONSUMABLE  — not individually tracked. The stored
//                   `InventoryItem.quantity` column IS authoritative.
//
// To prevent the two representations from drifting apart (the historical bug
// where `quantity` was set once at creation and never reconciled with the
// unit rows), all count/quantity/label derivation lives here and nowhere else.
// ─────────────────────────────────────────────────────────────────────────

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

export type UnitStatusCounts = {
  totalUnits: number
  available: number
  checkedOut: number
  inMaintenance: number
  inoperable: number
  retired: number
}

/**
 * Aggregate units by status. This is the only place unit statuses are tallied,
 * so every surface (inventory list, item detail, dashboard) reports the same numbers.
 */
export function computeUnitCounts(
  units: ReadonlyArray<{ status: string }>,
): UnitStatusCounts {
  const by = units.reduce<Record<string, number>>((acc, u) => {
    acc[u.status] = (acc[u.status] ?? 0) + 1
    return acc
  }, {})
  return {
    totalUnits: units.length,
    available: by['AVAILABLE'] ?? 0,
    checkedOut: by['CHECKED_OUT'] ?? 0,
    inMaintenance: by['IN_MAINTENANCE'] ?? 0,
    inoperable: by['INOPERABLE'] ?? 0,
    retired: by['RETIRED'] ?? 0,
  }
}

export type DerivedQuantities = {
  /** Units in circulation (retired excluded). For consumables, the stored count. */
  effectiveQuantity: number
  /** Number currently available to check out. */
  availableQuantity: number
}

/**
 * Single source of truth for an item's effective quantity & availability.
 *   SERIALIZED → derived from unit rows (retired excluded).
 *   CONSUMABLE → the stored `quantity` field.
 */
export function deriveQuantities(
  item: { itemType: string; quantity: number },
  counts: UnitStatusCounts,
): DerivedQuantities {
  if (item.itemType === SERIALIZED) {
    return {
      effectiveQuantity: counts.totalUnits - counts.retired,
      availableQuantity: counts.available,
    }
  }
  return { effectiveQuantity: item.quantity, availableQuantity: item.quantity }
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
