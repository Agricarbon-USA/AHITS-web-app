// ─────────────────────────────────────────────────────────────────────────
// Consumable stock accounting (total-owned, derived-availability model)
//
// See lib/inventory.ts for the two item kinds. For CONSUMABLE items:
//
//   • `InventoryItem.quantity` is the TOTAL OWNED count and is the stored
//     source of truth. It is mutated ONLY on permanent loss — field usage
//     ("log usage") or a write-off — NEVER on checkout or hub-return.
//
//   • AVAILABILITY is DERIVED, never stored:
//        available = quantity − Σ(open consumable reservations)
//     where a reservation is the `quantity` of an open (`removedAt = null`)
//     consumable kit item (`inventoryUnitId = null`).
//
//   • Consumables NEVER touch `InventoryUnit` rows. Only serialized items do.
//
// Centralising the read (reserved sum), the write (consume), and the guard
// (lock + availability assert) here means every flow — build-kit, add-items,
// return, log-usage, transfer, end — accounts for consumables identically.
// ─────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client'

/** Thrown when a checkout/transfer would exceed available consumable stock. */
export class InsufficientStockError extends Error {
  constructor(
    public readonly itemName: string,
    public readonly available: number,
    public readonly requested: number,
  ) {
    super(
      `Only ${available} of "${itemName}" available (requested ${requested}).`,
    )
    this.name = 'InsufficientStockError'
  }
}

/**
 * Sum of consumable quantity currently reserved in open kit items for one item.
 * This is the quantity that is "out" and therefore not available.
 */
export async function reservedConsumableQty(
  tx: Prisma.TransactionClient,
  inventoryItemId: string,
): Promise<number> {
  const agg = await tx.kitItem.aggregate({
    _sum: { quantity: true },
    where: { inventoryItemId, removedAt: null, inventoryUnitId: null },
  })
  return agg._sum.quantity ?? 0
}

/**
 * Reserved consumable quantity for many items at once (one query). Used by the
 * inventory list endpoint so each row can derive availability without N queries.
 */
export async function reservedConsumableMap(
  client: Prisma.TransactionClient | { kitItem: Prisma.TransactionClient['kitItem'] },
  inventoryItemIds: string[],
): Promise<Map<string, number>> {
  if (inventoryItemIds.length === 0) return new Map()
  const rows = await client.kitItem.groupBy({
    by: ['inventoryItemId'],
    where: {
      inventoryItemId: { in: inventoryItemIds },
      removedAt: null,
      inventoryUnitId: null,
    },
    _sum: { quantity: true },
  })
  return new Map(rows.map((r) => [r.inventoryItemId, r._sum.quantity ?? 0]))
}

/**
 * Lock a consumable item row FOR UPDATE, then assert that `requested` units are
 * available (quantity − reserved). Locking serialises concurrent consumable
 * checkouts of the same item so two operators can't over-reserve the same stock.
 * Call inside the same `$transaction` that creates the reserving kit item.
 *
 * Throws `InsufficientStockError` if not enough stock is available.
 */
export async function assertConsumableAvailable(
  tx: Prisma.TransactionClient,
  inventoryItemId: string,
  requested: number,
): Promise<void> {
  // Row lock: serialises read-check-reserve against concurrent checkouts.
  await tx.$queryRaw`SELECT id FROM inventory_items WHERE id = ${inventoryItemId} FOR UPDATE`
  const item = await tx.inventoryItem.findUnique({
    where: { id: inventoryItemId },
    select: { name: true, quantity: true, itemType: true },
  })
  if (!item) throw new Error('Item not found')
  if (item.itemType !== 'CONSUMABLE') {
    throw new Error('Item is not a consumable')
  }
  const reserved = await reservedConsumableQty(tx, inventoryItemId)
  const available = item.quantity - reserved
  if (available < requested) {
    throw new InsufficientStockError(item.name, Math.max(0, available), requested)
  }
}

/**
 * Permanently reduce owned stock for a consumable (field usage / write-off).
 * Guards against going negative. Returns false if the decrement was rejected
 * (insufficient owned stock — should not happen for stock already in a kit).
 */
export async function consumeConsumableStock(
  tx: Prisma.TransactionClient,
  inventoryItemId: string,
  quantity: number,
): Promise<boolean> {
  if (quantity <= 0) return true
  const res = await tx.inventoryItem.updateMany({
    where: { id: inventoryItemId, quantity: { gte: quantity } },
    data: { quantity: { decrement: quantity } },
  })
  return res.count > 0
}
