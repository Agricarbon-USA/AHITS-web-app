// UR-010 U3: shared formatting for per-hub consumable availability, so the operator
// checkout surfaces reveal WHY available < on-hand (i.e. some stock is reserved/held
// for fulfilled reservations). Pure function — safe to import in client components
// and unit-testable without a DB.

export interface HubStockRow {
  quantity: number
  reservedQty: number
  available: number
}

/**
 * Short label for a quantity field's helper text.
 * - With a hub row and a live reserve: "5 available · 3 reserved" (breakdown visible).
 * - With a hub row and no reserve:      "8 avail."
 * - No hub selected (row undefined):    "<fallbackAvailable> avail." (cross-hub total).
 */
export function stockAvailabilityLabel(
  row: HubStockRow | null | undefined,
  fallbackAvailable: number,
): string {
  if (!row) return `${Math.max(0, fallbackAvailable)} avail.`
  if (row.reservedQty > 0) return `${row.available} available · ${row.reservedQty} reserved`
  return `${row.available} avail.`
}
