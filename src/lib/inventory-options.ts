/**
 * PR-1b (L-2): the one adapter from `GET /api/inventory?mode=options` to the
 * option shape every picker already renders.
 *
 * Why an adapter rather than changing the pickers: seven call sites fetch the
 * picker list, and the components behind them (`NewDeploymentDialog` ×2,
 * `KitItemSelectRow`, `RequestComposer`) read `availableUnits` / `hubStock` /
 * `unitCounts.available`. Rewriting all of those to new field names inside a
 * correctness PR would multiply the review surface for no behaviour gain. So the
 * server returns the fix program's projection, this maps it once, and the picker
 * components are untouched.
 *
 * The important consequence: `availableUnits` here is the *server's* pickable set
 * (`PICKABLE_STATUSES`, D-n), so a picker can no longer offer a unit the server
 * would refuse — the old client-side `.filter(u => u.status === 'AVAILABLE')` over
 * a capped page is gone.
 */

export interface PickerUnit {
  id: string
  serialNumber: string | null
  qrCodeId: string
  status: string
  position: number
}

export interface PickerHubStockRow {
  hubId: string
  hubName: string | null
  quantity: number
  reservedQty: number
  available: number
}

/** One row of `GET /api/inventory?mode=options`. */
export interface InventoryOptionRow {
  id: string
  name: string
  itemType: string
  categoryId: string | null
  categoryName: string | null
  pickableUnits: PickerUnit[]
  availableQuantity: number
  availableByHub: PickerHubStockRow[]
}

/**
 * The shape the existing picker components read. Every field here is one some
 * picker renders today — nothing is invented to satisfy a type. (The three
 * `InventoryOption` interfaces declared `unitCounts` fields no picker reads;
 * PR-1b narrows them to `available` rather than fabricating zeros for the rest.)
 */
export interface PickerOption {
  id: string
  name: string
  itemType: 'CONSUMABLE' | 'SERIALIZED'
  category: { id: string; name: string }
  /** `isPickableItem` reads this for consumables. */
  quantity: number
  availableUnits: PickerUnit[]
  availableQuantity: number
  hubStock: PickerHubStockRow[]
  unitCounts: { available: number }
}

export interface PickerOptionsResult {
  options: PickerOption[]
  /** The ceiling was hit — the caller must search the server, not the array. */
  truncated: boolean
  /** The read failed. Distinct from "no matches" so the UI can offer a retry (L-16). */
  failed: boolean
}

const EMPTY: PickerOptionsResult = { options: [], truncated: false, failed: true }

function toOption(raw: InventoryOptionRow): PickerOption {
  const units = Array.isArray(raw.pickableUnits) ? raw.pickableUnits : []
  const serialized = raw.itemType === 'SERIALIZED'
  const availableQuantity = raw.availableQuantity ?? 0
  return {
    id: raw.id,
    name: raw.name,
    itemType: serialized ? 'SERIALIZED' : 'CONSUMABLE',
    category: { id: raw.categoryId ?? '', name: raw.categoryName ?? 'Uncategorized' },
    quantity: serialized ? units.length : availableQuantity,
    availableUnits: units,
    availableQuantity,
    hubStock: Array.isArray(raw.availableByHub) ? raw.availableByHub : [],
    // `availFor` reads this for SERIALIZED items. Pickable units ARE the available
    // ones (D-n), so the two numbers cannot drift the way they could when the
    // client recounted a capped page.
    unitCounts: { available: units.length },
  }
}

export function toPickerOptions(body: unknown): PickerOptionsResult {
  const rows = (body as { data?: unknown } | null)?.data
  if (!Array.isArray(rows)) return EMPTY
  return {
    options: (rows as InventoryOptionRow[]).map(toOption),
    truncated: (body as { truncated?: boolean }).truncated === true,
    failed: false,
  }
}

/**
 * Fetch the complete pickable set. Never throws: a failed read returns
 * `failed: true` with no options, so the caller can show a retry instead of an
 * empty picker that looks like an empty catalog for the rest of the session (L-16).
 */
export async function fetchPickerOptions(params?: { q?: string; hubId?: string }): Promise<PickerOptionsResult> {
  const search = new URLSearchParams({ mode: 'options' })
  if (params?.q) search.set('q', params.q)
  if (params?.hubId) search.set('hubId', params.hubId)
  try {
    const res = await fetch(`/api/inventory?${search.toString()}`)
    if (!res.ok) return EMPTY
    return toPickerOptions(await res.json())
  } catch {
    return EMPTY
  }
}

/**
 * The label a unit shows in every picker: its serial, else "Unit <position>" — the
 * API's position among ALL of the item's units (T8; ordered by createdAt then id, so
 * the same unit has the same number in every list). A Returning unit (IN_TRANSIT —
 * back from a deployment, not yet received at the hub; pickable since PR-3a) says so,
 * so picking it is a choice, not a surprise.
 */
export function unitLabel(u: { serialNumber: string | null; position: number; status?: string }): string {
  const base = u.serialNumber ?? `Unit ${u.position}`
  return u.status === 'IN_TRANSIT' ? `${base} · Returning` : base
}
