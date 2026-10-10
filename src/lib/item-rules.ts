import type { Prisma } from '@prisma/client'
import { ReferenceConflict } from '@/lib/asset-references'

/**
 * PR-6 (D49 · D-v/D-w/D-y): repairs, service, retire and units are for serialized
 * gear. The consumable-vs-serialized decision is made here and nowhere else; every
 * refusal is a ReferenceConflict, so the route's existing catch maps it to 409 —
 * terminal for the offline queue, with the message shown (never a 5xx retry loop).
 *
 *   assertSerialized(db, itemId, verb)  → the item, or 409 when it is a consumable
 *   assertTypeUnlocked(db, itemId)      → 409 once the item has any history
 *
 * Legacy rows (D-z) are history: unit-keyed routes keep keying on the unit, so a
 * legacy unit on a consumable is not refused by anything here.
 */

type Db = Prisma.TransactionClient

export type SerializedOnlyVerb = 'retire' | 'repair' | 'units'

export interface ItemTypeRow {
  id: string
  name: string
  itemType: 'SERIALIZED' | 'CONSUMABLE'
  deletedAt: Date | null
}

export function consumableMessage(name: string, verb: SerializedOnlyVerb): string {
  if (verb === 'retire') return `"${name}" is a consumable — consumables are used up or deleted, not retired.`
  if (verb === 'repair') return `"${name}" is a consumable — repairs and service are for serialized gear.`
  return `"${name}" is a consumable — consumables don't have units.`
}

export const TYPE_LOCKED_MESSAGE = 'Type is fixed once an item has units or stock — add a new item instead.'

/** Loads the item; throws the D-v / D-w / D-y 409 when it is a consumable. Null when missing. */
export async function assertSerialized(db: Db, itemId: string, verb: SerializedOnlyVerb): Promise<ItemTypeRow | null> {
  const item = await db.inventoryItem.findUnique({
    where: { id: itemId },
    select: { id: true, name: true, itemType: true, deletedAt: true },
  })
  if (item && item.itemType === 'CONSUMABLE') throw new ReferenceConflict(consumableMessage(item.name, verb))
  return item
}

/** D-y: an item's type is fixed once it has any unit (deleted included), stock row, kit line, check log or task. */
export async function assertTypeUnlocked(db: Db, itemId: string): Promise<void> {
  const [units, stock, kitLines, logs, tasks] = await Promise.all([
    db.inventoryUnit.count({ where: { inventoryItemId: itemId } }),
    db.inventoryStock.count({ where: { itemId } }),
    db.kitItem.count({ where: { inventoryItemId: itemId } }),
    db.checkLog.count({ where: { itemId } }),
    db.maintenanceTask.count({ where: { itemId } }),
  ])
  if (units + stock + kitLines + logs + tasks > 0) throw new ReferenceConflict(TYPE_LOCKED_MESSAGE)
}

/**
 * D-x: a damaged consumable is written off, not repaired. True for a CONSUMABLE line
 * whose declared disposition is INOPERABLE (whatever `canBeFixed` says — a payload
 * already queued on a phone lands as a write-off, never a 409) or a HUB return marked
 * IN_MAINTENANCE / INOPERABLE. Decided on the item type before any repair field is read.
 */
export function isConsumableWriteOff(itemType: string, type: string | undefined, returnCondition: string | undefined): boolean {
  if (itemType !== 'CONSUMABLE') return false
  if (type === 'INOPERABLE') return true
  return type === 'HUB' && (returnCondition === 'IN_MAINTENANCE' || returnCondition === 'INOPERABLE')
}

/** The write-off note: `Written off` plus whatever the return said. */
export function writeOffNotes(extra: string | null | undefined): string {
  return ['Written off', extra].filter(Boolean).join(' — ')
}

/**
 * The write-off record (no migration): a CHECK_IN marked MISSING_PARTS with the
 * `Written off` note, plus the damage photos stored against the item — exactly where
 * the unit-less INOPERABLE branch puts them. Stock is not restored, no task, no bell.
 */
export async function recordWriteOff(
  db: Db,
  w: { itemId: string; unitId?: string | null; operatorId: string; rigId: string; notes: string; photoUrls?: string[]; uploadedById: string },
): Promise<void> {
  await db.checkLog.create({
    data: {
      action: 'CHECK_IN',
      itemId: w.itemId,
      inventoryUnitId: w.unitId ?? undefined,
      operatorId: w.operatorId,
      rigId: w.rigId,
      notes: w.notes,
      condition: 'MISSING_PARTS',
    },
  })
  if (w.photoUrls && w.photoUrls.length > 0) {
    await db.photo.createMany({
      data: w.photoUrls.map((url) => ({ url, context: 'DAMAGE' as const, inventoryItemId: w.itemId, uploadedById: w.uploadedById })),
    })
  }
}
