import type { EquipmentStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveAlertsFor } from '@/lib/alerts'
import { LIVE_KIT_ITEM, OPEN_TASK, PICKABLE_STATUSES } from '@/lib/populations'
import { closeDamageTask, openDamageTask, type DamageTaskFields } from '@/lib/maintenance'
import { assertNoOpenReferences, openReferences, ReferenceConflict } from '@/lib/asset-references'

/**
 * PR-3a (RC-1 · D-g): the ONLY writers of `vehicle.status` and
 * `inventoryUnit.status` outside migrations. `tests/pr3a-status-writers-guard.test.ts`
 * fails the build if any other file in `src/` writes either.
 *
 * Asset status is derived from the records that explain it:
 *   IN_MAINTENANCE ⇒ an open damage task exists (never the converse: a "Still
 *     usable" report leaves the unit CHECKED_OUT with its task open — D29);
 *   CHECKED_OUT ⇔ a live kit item on an active deployment;
 *   IN_TRANSIT ⇔ an active HUB_RETURN link ("Returning", D-e);
 *   RETIRED ⇒ nothing live references it.
 * Admin-held states — vehicle OUT_OF_SERVICE / RETIRED, unit INOPERABLE / RETIRED —
 * are never changed as a side effect of anything here (D-c).
 *
 * Every function takes the caller's transaction client, so a status and the record
 * that explains it commit or roll back together.
 */

type Tx = Prisma.TransactionClient

export type AssetRef = { kind: 'vehicle'; id: string } | { kind: 'unit'; id: string }

const ACTIVE_HUB_RETURN_STATES = ['ISSUED', 'VIEWED', 'ACTED'] as const

/**
 * Put an asset in repair. Vehicle → IN_MAINTENANCE from ACTIVE only; unit →
 * IN_MAINTENANCE from anything but RETIRED (a unit in a kit stays in its kit —
 * CC-34 3c). OUT_OF_SERVICE and RETIRED are admin decisions and stay as they are
 * (today `report-damage` overwrote them — D-c).
 */
export async function pullForRepair(tx: Tx, asset: AssetRef): Promise<void> {
  if (asset.kind === 'vehicle') {
    await tx.vehicle.updateMany({
      where: { id: asset.id, status: 'ACTIVE' },
      data: { status: 'IN_MAINTENANCE' },
    })
    return
  }
  await tx.inventoryUnit.updateMany({
    where: { id: asset.id, status: { notIn: ['RETIRED', 'IN_MAINTENANCE'] } },
    data: { status: 'IN_MAINTENANCE' },
  })
}

/**
 * Return an asset to service when nothing still holds it in repair: only from
 * IN_MAINTENANCE, and only when no other open damage report references it.
 * Vehicle → ACTIVE. Unit → CHECKED_OUT if a live kit item still holds it (it never
 * left the operator's kit), else AVAILABLE. OUT_OF_SERVICE, INOPERABLE and RETIRED
 * are never touched (D-c). Returns the status written, or null when nothing changed.
 */
export async function restoreIfClear(
  tx: Tx,
  asset: AssetRef,
  opts: { excludeTaskId?: string } = {},
): Promise<'ACTIVE' | 'AVAILABLE' | 'CHECKED_OUT' | null> {
  const notThisTask = opts.excludeTaskId ? { id: { not: opts.excludeTaskId } } : {}
  if (asset.kind === 'vehicle') {
    const stillOpen = await tx.maintenanceTask.findFirst({
      where: { ...OPEN_TASK, ...notThisTask, isDamageReport: true, vehicleId: asset.id, inventoryUnitId: null },
      select: { id: true },
    })
    if (stillOpen) return null
    const res = await tx.vehicle.updateMany({
      where: { id: asset.id, status: 'IN_MAINTENANCE' },
      data: { status: 'ACTIVE' },
    })
    return res.count > 0 ? 'ACTIVE' : null
  }
  const stillOpen = await tx.maintenanceTask.findFirst({
    where: { ...OPEN_TASK, ...notThisTask, isDamageReport: true, inventoryUnitId: asset.id },
    select: { id: true },
  })
  if (stillOpen) return null
  const inKit = await tx.kitItem.findFirst({
    where: { ...LIVE_KIT_ITEM, inventoryUnitId: asset.id },
    select: { id: true },
  })
  const to = inKit ? 'CHECKED_OUT' : 'AVAILABLE'
  const res = await tx.inventoryUnit.updateMany({
    where: { id: asset.id, status: 'IN_MAINTENANCE' },
    data: { status: to },
  })
  return res.count > 0 ? to : null
}

/**
 * Retire one unit: RETIRED, its QR label released with the `::retired::<ts>`
 * suffix (the same one review-inoperable has always used, so the physical label can
 * be re-registered), every open damage task on it closed as RETIRED, and every
 * alert raised for the unit resolved. The reference guard is PR-3b's
 * `assertNoOpenReferences`; until then callers keep their own in-route checks.
 */
export async function retireUnit(tx: Tx, unitId: string, note: string): Promise<void> {
  const unit = await tx.inventoryUnit.findUniqueOrThrow({ where: { id: unitId }, select: { qrCodeId: true } })
  await tx.inventoryUnit.update({
    where: { id: unitId },
    data: { status: 'RETIRED', qrCodeId: `${unit.qrCodeId}::retired::${Date.now()}` },
  })
  const open = await tx.maintenanceTask.findMany({
    where: { ...OPEN_TASK, isDamageReport: true, inventoryUnitId: unitId },
    select: { id: true },
  })
  for (const t of open) await closeDamageTask(tx, t.id, 'RETIRED', { notes: note })
  await resolveAlertsFor('inventory_units', unitId, tx)
}

export type ReturnCondition = 'GOOD' | 'IN_MAINTENANCE' | 'INOPERABLE'

/**
 * The one rule for a serialized unit coming off a deployment — end of deployment,
 * bulk return and single return all call this (the caller closes the kit item in
 * the same transaction, with its own race-safe claim):
 *   • already IN_MAINTENANCE → stays IN_MAINTENANCE, its repair stays open, and the
 *     hub is recorded on the open task as where it went (D-d: the hub inherits the
 *     repair; the return is never refused for this);
 *   • GOOD → IN_TRANSIT ("Returning") when the caller will issue its HUB_RETURN link
 *     after commit (`linked`), else AVAILABLE — a unit with no link to confirm must
 *     never sit Returning forever;
 *   • IN_MAINTENANCE or INOPERABLE → an open damage task that pulls it
 *     (`openDamageTask({ pull: true })`), so a damaged return is never task-less
 *     (S-2 / C-2).
 * Returns the status the unit ended in.
 */
export async function returnUnit(
  tx: Tx,
  unitId: string,
  opts: {
    condition: ReturnCondition
    hubId?: string | null
    linked: boolean
    task: Omit<DamageTaskFields, 'pull' | 'source'> & { itemId: string }
  },
): Promise<EquipmentStatus> {
  const unit = await tx.inventoryUnit.findUniqueOrThrow({ where: { id: unitId }, select: { status: true } })

  if (unit.status === 'IN_MAINTENANCE') {
    if (opts.hubId) {
      await tx.maintenanceTask.updateMany({
        where: { ...OPEN_TASK, isDamageReport: true, inventoryUnitId: unitId },
        data: { returnDestinationType: 'HUB', returnDestinationId: opts.hubId },
      })
    }
    return 'IN_MAINTENANCE'
  }

  if (opts.condition === 'GOOD') {
    const to = opts.linked ? 'IN_TRANSIT' : 'AVAILABLE'
    await tx.inventoryUnit.updateMany({ where: { id: unitId, status: { not: 'RETIRED' } }, data: { status: to } })
    return to
  }

  await openDamageTask(tx, { kind: 'unit', id: unitId, itemId: opts.task.itemId }, {
    ...opts.task,
    source: 'RETURN',
    pull: true,
  })
  return 'IN_MAINTENANCE'
}

/**
 * The post-commit fallback for a GOOD return whose HUB_RETURN link could not be
 * issued: those units go back to AVAILABLE rather than sit Returning with no link
 * the hub could ever confirm. Runs outside the return's transaction by design.
 */
export async function releaseUnlinkedReturns(unitIds: string[], db: Tx = prisma): Promise<void> {
  if (unitIds.length === 0) return
  await db.inventoryUnit.updateMany({
    where: { id: { in: unitIds }, status: 'IN_TRANSIT' },
    data: { status: 'AVAILABLE' },
  })
}

/**
 * A unit reported broken beyond a field fix (the "can't be fixed" disposition):
 * INOPERABLE, which is the admin review queue (`review-inoperable` decides
 * RETIRE or REPAIR). The caller raises the review bell.
 */
export async function markInoperable(
  tx: Tx,
  unitId: string,
  report: { notes: string | null; reportedById: string; at: Date },
): Promise<void> {
  await tx.inventoryUnit.updateMany({
    where: { id: unitId, status: { not: 'RETIRED' } },
    data: {
      status: 'INOPERABLE',
      inoperableNotes: report.notes,
      inoperableReportedAt: report.at,
      inoperableReportedById: report.reportedById,
    },
  })
}

/**
 * Pick a unit onto a deployment: AVAILABLE or IN_TRANSIT → CHECKED_OUT, guarded on
 * the status it was read in so two concurrent picks of the same unit cannot both
 * win. Picking a Returning unit completes its open HUB_RETURN link(s) — the hub
 * never needs to confirm gear that has already gone back out (D-e, P-15).
 * Returns false when the unit is not pickable (or was just taken).
 *
 * D-n: this landed in the same commit that widened `PICKABLE_STATUSES` to
 * ['AVAILABLE', 'IN_TRANSIT'], so no picker offers a unit this refuses.
 */
export async function pickUnit(
  tx: Tx,
  unitId: string,
  opts: { inventoryItemId?: string; actorLabel?: string } = {},
): Promise<boolean> {
  const unit = await tx.inventoryUnit.findFirst({
    where: {
      id: unitId,
      ...(opts.inventoryItemId && { inventoryItemId: opts.inventoryItemId }),
    },
    select: { status: true, deletedAt: true, inventoryItem: { select: { name: true, deletedAt: true } } },
  })
  if (!unit) return false
  // PR-3c: deleted gear is refused by name (409), not as "just taken by someone else".
  if (unit.deletedAt || unit.inventoryItem.deletedAt) throw deletedGear(unit.inventoryItem.name)
  if (!(PICKABLE_STATUSES as readonly EquipmentStatus[]).includes(unit.status)) return false
  const claimed = await tx.inventoryUnit.updateMany({
    where: { id: unitId, status: unit.status },
    data: { status: 'CHECKED_OUT' },
  })
  if (claimed.count === 0) return false

  if (unit.status === 'IN_TRANSIT') {
    const now = new Date()
    const links = await tx.statusLink.findMany({
      where: { type: 'HUB_RETURN', inventoryUnitId: unitId, state: { in: [...ACTIVE_HUB_RETURN_STATES] } },
      select: { id: true },
    })
    for (const link of links) {
      await tx.statusLink.update({ where: { id: link.id }, data: { state: 'COMPLETED', completedAt: now } })
      await tx.statusLinkEvent.create({
        data: {
          statusLinkId: link.id,
          action: 'COMPLETED',
          note: 'Re-deployed before hub receipt',
          actorLabel: opts.actorLabel ?? 'system',
        },
      })
    }
  }
  return true
}

/** Order pickable units for a by-quantity checkout: AVAILABLE before Returning. */
export function pickableFirst<T extends { status: EquipmentStatus }>(units: T[]): T[] {
  return [...units].sort((a, b) => Number(a.status !== 'AVAILABLE') - Number(b.status !== 'AVAILABLE'))
}

/**
 * Take a vehicle off a deployment: the rig_vehicles row is closed and the vehicle
 * unassigned. The disposition decides the rest:
 *   • AVAILABLE — status untouched (S-1: a vehicle with an open repair stays In
 *     Maintenance; one an admin took out of service stays out);
 *   • IN_MAINTENANCE — an open damage task that pulls it (`openDamageTask`, which
 *     reuses the vehicle's open report rather than starting a second);
 *   • RETIRED — retired.
 */
export async function removeVehicleFromRig(
  tx: Tx,
  input: {
    rigId: string
    vehicleId: string
    disposition: 'AVAILABLE' | 'IN_MAINTENANCE' | 'RETIRED'
    note: string | null
    reportedById: string
  },
): Promise<void> {
  await tx.rigVehicle.updateMany({
    where: { rigId: input.rigId, vehicleId: input.vehicleId, removedAt: null },
    data: { removedAt: new Date(), removeNote: input.note },
  })
  await tx.vehicle.updateMany({ where: { id: input.vehicleId }, data: { assignedOperatorId: null } })

  if (input.disposition === 'IN_MAINTENANCE') {
    const v = await tx.vehicle.findUnique({ where: { id: input.vehicleId }, select: { name: true } })
    await openDamageTask(tx, { kind: 'vehicle', id: input.vehicleId }, {
      taskName: `Damage report: ${v?.name ?? 'vehicle'}`,
      notes: input.note,
      rigId: input.rigId,
      reportedById: input.reportedById,
      alertMeta: { vehicleName: v?.name ?? 'vehicle', operatorId: input.reportedById },
      source: 'REMOVE_VEHICLE',
      pull: true,
    })
  } else if (input.disposition === 'RETIRED') {
    // PR-3b: off this deployment now — but still refused if anything else holds it.
    const v = await tx.vehicle.findUnique({ where: { id: input.vehicleId }, select: { name: true } })
    assertNoOpenReferences('vehicle', v?.name ?? 'This vehicle', await openReferences({ vehicleId: input.vehicleId }, tx))
    await retireVehicle(tx, input.vehicleId, input.note)
  }
}

/** HUB_RETURN receipt (hub link or admin "Mark received"): a Returning unit is back on the shelf. */
export async function receiveUnitAtHub(tx: Tx, unitId: string): Promise<void> {
  await tx.inventoryUnit.updateMany({
    where: { id: unitId, status: 'IN_TRANSIT' },
    data: { status: 'AVAILABLE' },
  })
}

/**
 * Revoke a status link. For a HUB_RETURN link the hub will now never confirm, so
 * its Returning unit goes back to AVAILABLE — in the same transaction as the revoke
 * (they used to be two separate writes). Returns the link's type and unit, or null
 * when the link was already terminal.
 */
export async function revokeHubReturn(
  tx: Tx,
  linkId: string,
): Promise<{ type: string; inventoryUnitId: string | null } | null> {
  const link = await tx.statusLink.findUnique({ where: { id: linkId }, select: { type: true, inventoryUnitId: true } })
  const revoked = await tx.statusLink.updateMany({
    where: { id: linkId, state: { notIn: ['COMPLETED', 'REVOKED'] } },
    data: { state: 'REVOKED', revokedAt: new Date() },
  })
  if (revoked.count === 0 || !link) return null
  if (link.type === 'HUB_RETURN' && link.inventoryUnitId) {
    await receiveUnitAtHub(tx, link.inventoryUnitId)
  }
  return link
}

/**
 * A unit left on a deployment that has ended (a declined or cancelled end-of-
 * deployment transfer): it is no longer in any live kit, so CHECKED_OUT becomes
 * AVAILABLE. Every other state is kept — a unit in repair stays in repair (the
 * decline/cancel paths used to write AVAILABLE unconditionally).
 */
export async function releaseFromEndedRig(tx: Tx, unitIds: string[]): Promise<void> {
  if (unitIds.length === 0) return
  await tx.inventoryUnit.updateMany({
    where: { id: { in: unitIds }, status: 'CHECKED_OUT' },
    data: { status: 'AVAILABLE' },
  })
}

/**
 * Retire a vehicle (Edit form, or the remove-from-deployment "Retired" disposition):
 * RETIRED, and any open damage report on it closed as RETIRED. The caller has
 * already passed `assertNoOpenReferences('vehicle')` (PR-3b) — a vehicle on a live
 * deployment or in a pending transfer is refused before this runs.
 */
export async function retireVehicle(tx: Tx, vehicleId: string, note: string | null): Promise<void> {
  await tx.vehicle.update({ where: { id: vehicleId }, data: { status: 'RETIRED' } })
  const open = await tx.maintenanceTask.findMany({
    where: { ...OPEN_TASK, isDamageReport: true, vehicleId, inventoryUnitId: null },
    select: { id: true },
  })
  for (const t of open) await closeDamageTask(tx, t.id, 'RETIRED', { notes: note })
}

/**
 * The admin-owned vehicle states (D-g): ACTIVE ↔ OUT_OF_SERVICE — "Return to
 * service" / "Take out of service" in the drawer and the Edit form's Status. Returning
 * a vehicle to service while a damage report is still open lands it IN_MAINTENANCE,
 * not ACTIVE: the admin's hold is lifted, the repair still holds it, and it goes
 * Active when the repair closes (D-g — IN_MAINTENANCE ⇒ an open repair). ACTIVE from
 * IN_MAINTENANCE with an open repair is refused by the route ("Close the repair
 * first"); RETIRED goes through `retireVehicle`. Returns the status written.
 */
export async function setVehicleServiceStatus(
  tx: Tx,
  vehicleId: string,
  status: 'ACTIVE' | 'OUT_OF_SERVICE',
): Promise<'ACTIVE' | 'OUT_OF_SERVICE' | 'IN_MAINTENANCE'> {
  let to: 'ACTIVE' | 'OUT_OF_SERVICE' | 'IN_MAINTENANCE' = status
  if (status === 'ACTIVE') {
    const repair = await tx.maintenanceTask.findFirst({
      where: { ...OPEN_TASK, isDamageReport: true, vehicleId, inventoryUnitId: null },
      select: { id: true },
    })
    if (repair) to = 'IN_MAINTENANCE'
  }
  await tx.vehicle.update({ where: { id: vehicleId }, data: { status: to } })
  return to
}

/**
 * The admin-owned unit states (D-g): AVAILABLE ↔ RETIRED. Retiring goes through
 * `retireUnit`; this is the other direction — a retired unit brought back. Retire
 * released its QR label with a `::retired::<ts>` suffix; un-retiring restores the
 * original code so the physical label scans again — unless another live unit has
 * re-registered that code meanwhile, in which case the suffix stays (that label now
 * belongs to the other unit) and the caller reports it.
 */
export async function unretireUnit(tx: Tx, unitId: string): Promise<{ restored: boolean; labelRestored: boolean }> {
  const unit = await tx.inventoryUnit.findUnique({ where: { id: unitId }, select: { status: true, qrCodeId: true } })
  if (!unit || unit.status !== 'RETIRED') return { restored: false, labelRestored: false }
  const base = unit.qrCodeId.split('::retired::')[0]
  const taken = base !== unit.qrCodeId
    ? await tx.inventoryUnit.findFirst({ where: { qrCodeId: base, id: { not: unitId } }, select: { id: true } })
    : null
  const labelRestored = base !== unit.qrCodeId && !taken
  await tx.inventoryUnit.update({
    where: { id: unitId },
    data: { status: 'AVAILABLE', ...(labelRestored && { qrCodeId: base }) },
  })
  return { restored: true, labelRestored }
}

// ── PR-3c · Delete an item (and restore it) ─────────────────────────────────────
//
// D-o: Delete is a reversible soft delete for mistakes, duplicates and test entries.
// The item, its units and its non-damage schedules leave every list, count, picker
// and report; history rows stay; Restore brings back exactly what one Delete hid.
// D-u: QR labels stay bound (unlike Retire), so Restore is exact and Undo lossless.
// Every row one Delete touches carries the same `deletedAt` stamp — that stamp is
// how Restore tells "deleted with the item" from "deleted separately before".

/** The 409 for checking out, or writing to, gear that was deleted (PR-3c). */
export function deletedGear(name: string): ReferenceConflict {
  return new ReferenceConflict(`${name} was deleted from inventory`)
}

/** The 409 text for a write to a deleted item: "Restore it first". */
export const restoreFirst = (name: string) => `${name} was deleted — restore it first.`

/** The name of the item if it is deleted, else null (missing items are the caller's 404). */
export async function deletedItemName(itemId: string, db: Tx = prisma): Promise<string | null> {
  const item = await db.inventoryItem.findUnique({ where: { id: itemId }, select: { name: true, deletedAt: true } })
  return item?.deletedAt ? item.name : null
}

/** Checkout guard: refuse (409, by name) when any of these items was deleted. */
export async function refuseDeletedItems(tx: Tx, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return
  const gone = await tx.inventoryItem.findFirst({
    where: { id: { in: [...new Set(itemIds)] }, deletedAt: { not: null } },
    select: { name: true },
  })
  if (gone) throw deletedGear(gone.name)
}

/**
 * Delete an item (D-o). Refused with a 409 naming what is in the way — units out or
 * in repair, open repairs on it or its units, kit lines left open on any rig, pending
 * transfers, reservation holds, units reserved on its stock, open requests naming it.
 * Otherwise, with one `now` stamp: the item (and who deleted it), every live unit
 * (status and QR untouched — D-u), and its non-damage schedules. Its alerts resolve —
 * the item's own, its per-hub / serialized LOW_INVENTORY keys (`<id>:<hub>`,
 * `<id>:serialized`) and each unit's. Stock rows are untouched: Restore needs them,
 * and the guard has made their reservations 0. Returns null when there is no live item.
 */
export async function deleteItem(
  tx: Tx,
  itemId: string,
  byUserId: string | null,
): Promise<{ name: string; deletedAt: Date } | null> {
  const item = await tx.inventoryItem.findFirst({ where: { id: itemId, deletedAt: null }, select: { name: true } })
  if (!item) return null
  assertNoOpenReferences('item-delete', item.name, await openReferences({ itemId }, tx, { scope: 'delete' }))

  const now = new Date()
  await tx.inventoryItem.update({ where: { id: itemId }, data: { deletedAt: now, deletedById: byUserId } })
  const units = await tx.inventoryUnit.findMany({ where: { inventoryItemId: itemId, deletedAt: null }, select: { id: true } })
  if (units.length > 0) {
    await tx.inventoryUnit.updateMany({ where: { id: { in: units.map((u) => u.id) } }, data: { deletedAt: now } })
  }
  await tx.maintenanceTask.updateMany({
    where: { itemId, isDamageReport: false, deletedAt: null },
    data: { deletedAt: now },
  })

  const itemAlerts = await tx.alert.findMany({
    where: { resolved: false, sourceTable: 'inventory_items', OR: [{ sourceId: itemId }, { sourceId: { startsWith: `${itemId}:` } }] },
    select: { sourceId: true },
  })
  for (const sourceId of new Set(itemAlerts.map((a) => a.sourceId).filter((x): x is string => !!x))) {
    await resolveAlertsFor('inventory_items', sourceId, tx)
  }
  for (const u of units) await resolveAlertsFor('inventory_units', u.id, tx)

  return { name: item.name, deletedAt: now }
}

/**
 * Restore a deleted item: clears its `deletedAt` / `deletedById`, and `deletedAt` on
 * the units and schedules that carry the item's own stamp. A unit deleted separately
 * before stays deleted. Stock, status and QR were never touched. (A LOW_INVENTORY
 * alert may re-raise on the next cron — expected under D-i.) Returns null when the
 * item is not deleted.
 */
export async function restoreItem(tx: Tx, itemId: string): Promise<{ name: string } | null> {
  const item = await tx.inventoryItem.findFirst({
    where: { id: itemId, deletedAt: { not: null } },
    select: { name: true, deletedAt: true },
  })
  if (!item?.deletedAt) return null
  // Prisma cannot say "equals the parent's column" in a nested where — compare in JS.
  const stamp = item.deletedAt.getTime()
  const sameStamp = <T extends { id: string; deletedAt: Date | null }>(rows: T[]) =>
    rows.filter((r) => r.deletedAt?.getTime() === stamp).map((r) => r.id)

  const units = sameStamp(await tx.inventoryUnit.findMany({
    where: { inventoryItemId: itemId, deletedAt: { not: null } },
    select: { id: true, deletedAt: true },
  }))
  if (units.length > 0) await tx.inventoryUnit.updateMany({ where: { id: { in: units } }, data: { deletedAt: null } })
  const tasks = sameStamp(await tx.maintenanceTask.findMany({
    where: { itemId, isDamageReport: false, deletedAt: { not: null } },
    select: { id: true, deletedAt: true },
  }))
  if (tasks.length > 0) await tx.maintenanceTask.updateMany({ where: { id: { in: tasks } }, data: { deletedAt: null } })
  await tx.inventoryItem.update({ where: { id: itemId }, data: { deletedAt: null, deletedById: null } })
  return { name: item.name }
}
