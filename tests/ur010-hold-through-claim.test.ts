import { describe, it, expect } from 'vitest'
import { prisma } from '../src/lib/prisma'
import {
  createRequest,
  applyRequestTransition,
  setLineFulfillment,
  claimHeldStock,
  releaseAllHeldForRequest,
} from '../src/lib/deployment-requests'
import { drawReservedFromHub, setStockAtHub, resyncItemTotal } from '../src/lib/inventory-stock'
import { seedInventoryStock, createHub, createCategory, createInventoryItem, createOperator } from './helpers/fixtures'

// ── UR-010 hold-through-claim (Option A) ───────────────────────────────────────
// A fulfilled reservation HOLDS the reserve for the operator until they CLAIM it at
// checkout. Invariant, per (heldItemId, heldHubId):
//   inventory_stock.reservedQty == Σ over FULFILLED, releasedAt IS NULL lines of
//                                  (heldQty - claimedQty)

async function getStock(itemId: string, hubId: string) {
  const rows = await prisma.$queryRaw<{ quantity: number; reservedQty: number }[]>`
    SELECT "quantity", "reservedQty" FROM "inventory_stock" WHERE "itemId" = ${itemId} AND "hubId" = ${hubId}
  `
  return rows[0] ?? null
}

async function getItemTotal(itemId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ quantity: number }[]>`
    SELECT "quantity" FROM "inventory_items" WHERE "id" = ${itemId}
  `
  return Number(rows[0]?.quantity ?? 0)
}

async function firstLine(requestId: string) {
  const rows = await prisma.$queryRaw<{
    id: string; heldQty: number; claimedQty: number; heldItemId: string | null; heldHubId: string | null; releasedAt: Date | null
  }[]>`
    SELECT "id", "heldQty", "claimedQty", "heldItemId", "heldHubId", "releasedAt"
    FROM "deployment_request_lines" WHERE "requestId" = ${requestId} ORDER BY "createdAt" ASC
  `
  return rows[0] ?? null
}

async function confirmAllLines(requestId: string): Promise<void> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "deployment_request_lines" WHERE "requestId" = ${requestId} ORDER BY "createdAt" ASC
  `
  for (const { id } of rows) {
    await setLineFulfillment(id, { status: 'CONFIRMED', actor: { label: 'test' } })
  }
}

/** REQUESTED → confirm(STAGED, reserves) → fulfill(FULFILLED, snapshots the hold). */
async function reserveAndFulfill(hubId: string, itemId: string, qty: number, operatorId: string): Promise<string> {
  const requestId = await createRequest(
    {
      requestType: 'RESERVATION',
      status: 'REQUESTED',
      fulfillerHubId: hubId,
      lines: [{ lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: qty, specificInventoryItemId: itemId }],
    },
    operatorId,
  )
  await confirmAllLines(requestId)
  expect(await applyRequestTransition(requestId, 'confirm', 'RESERVATION')).toEqual({ ok: true })
  expect(await applyRequestTransition(requestId, 'fulfill', 'RESERVATION')).toEqual({ ok: true })
  return requestId
}

describe('UR-010 hold-through-claim', () => {
  it('fulfill HOLDS the reserve (does not release) and snapshots heldQty == reservedQty', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const operator = await createOperator()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    await seedInventoryStock(item.id, hub.id, 10)

    const requestId = await reserveAndFulfill(hub.id, item.id, 4, operator.id)

    // The reserve is NOT released at fulfill — it becomes the hold.
    const stock = await getStock(item.id, hub.id)
    expect(stock?.reservedQty).toBe(4)
    expect(stock?.quantity).toBe(10) // physical stock untouched until claim

    const line = await firstLine(requestId)
    expect(line?.heldQty).toBe(4)
    expect(line?.claimedQty).toBe(0)
    expect(line?.heldItemId).toBe(item.id)
    expect(line?.heldHubId).toBe(hub.id)
    expect(line?.releasedAt).toBeNull()

    // Invariant: reservedQty == Σ(heldQty - claimedQty).
    expect(stock?.reservedQty).toBe((line?.heldQty ?? 0) - (line?.claimedQty ?? 0))
  })

  it('claim converts reserve→draw and decrements the cross-hub total exactly once', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const operator = await createOperator()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    await seedInventoryStock(item.id, hub.id, 10)
    const requestId = await reserveAndFulfill(hub.id, item.id, 4, operator.id)

    const claimed = await prisma.$transaction(async (tx) => {
      const c = await claimHeldStock(operator.id, item.id, hub.id, 4, tx)
      await resyncItemTotal(item.id, tx) // mirror the checkout route
      return c
    })

    expect(claimed).toBe(4)
    const stock = await getStock(item.id, hub.id)
    expect(stock?.quantity).toBe(6) // 10 - 4 drawn
    expect(stock?.reservedQty).toBe(0) // reserve consumed by the claim
    expect(await getItemTotal(item.id)).toBe(6) // total resynced, not double-counted

    const line = await firstLine(requestId)
    expect(line?.claimedQty).toBe(4)
    expect(line?.heldQty).toBe(4)
  })

  it('claims only the operator’s own hold; a stranger claims nothing', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const operator = await createOperator()
    const stranger = await createOperator()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    await seedInventoryStock(item.id, hub.id, 10)
    await reserveAndFulfill(hub.id, item.id, 3, operator.id)

    const strangerClaim = await prisma.$transaction((tx) => claimHeldStock(stranger.id, item.id, hub.id, 3, tx))
    expect(strangerClaim).toBe(0)
    // Reserve untouched — still held for the real operator.
    expect((await getStock(item.id, hub.id))?.reservedQty).toBe(3)
  })

  it('partial claim leaves a hold; releaseAllHeldForRequest frees only the remainder, once', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const operator = await createOperator()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    await seedInventoryStock(item.id, hub.id, 10)
    const requestId = await reserveAndFulfill(hub.id, item.id, 5, operator.id)

    const claimed = await prisma.$transaction((tx) => claimHeldStock(operator.id, item.id, hub.id, 2, tx))
    expect(claimed).toBe(2)
    let stock = await getStock(item.id, hub.id)
    expect(stock?.quantity).toBe(8)
    expect(stock?.reservedQty).toBe(3) // 5 held - 2 claimed still reserved

    // Release the unclaimed remainder (H3: only heldQty - claimedQty = 3).
    const released = await prisma.$transaction((tx) => releaseAllHeldForRequest(requestId, tx))
    expect(released).toBe(3)
    stock = await getStock(item.id, hub.id)
    expect(stock?.reservedQty).toBe(0)
    expect(stock?.quantity).toBe(8) // release frees reserve only; quantity unchanged

    // H5: release-once — a second release frees nothing.
    const again = await prisma.$transaction((tx) => releaseAllHeldForRequest(requestId, tx))
    expect(again).toBe(0)
    expect((await getStock(item.id, hub.id))?.reservedQty).toBe(0)

    const line = await firstLine(requestId)
    expect(line?.releasedAt).not.toBeNull()
  })

  it('C2: two concurrent full claims cannot over-claim (FOR UPDATE serializes them)', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const operator = await createOperator()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    await seedInventoryStock(item.id, hub.id, 10)
    const requestId = await reserveAndFulfill(hub.id, item.id, 5, operator.id)

    // Both racing claims ask for the full 5. Without the row-lock both would draw 5 (=10).
    const [a, b] = await Promise.all([
      prisma.$transaction((tx) => claimHeldStock(operator.id, item.id, hub.id, 5, tx)),
      prisma.$transaction((tx) => claimHeldStock(operator.id, item.id, hub.id, 5, tx)),
    ])
    expect(a + b).toBe(5) // exactly the held amount — never 10

    const stock = await getStock(item.id, hub.id)
    expect(stock?.quantity).toBe(5) // 10 - 5, not 10 - 10
    expect(stock?.reservedQty).toBe(0)
    const line = await firstLine(requestId)
    expect(line?.claimedQty).toBe(5) // never exceeds heldQty
  })

  it('H2: a guarded-draw shortfall throws HOLD_INVARIANT_BREACH and rolls the claim back', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const operator = await createOperator()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    await seedInventoryStock(item.id, hub.id, 10)
    const requestId = await reserveAndFulfill(hub.id, item.id, 4, operator.id)

    // Force an out-of-band shortfall: physical quantity below the held/reserved qty.
    await prisma.$executeRaw`
      UPDATE "inventory_stock" SET "quantity" = 2 WHERE "itemId" = ${item.id} AND "hubId" = ${hub.id}
    `

    await expect(
      prisma.$transaction((tx) => claimHeldStock(operator.id, item.id, hub.id, 4, tx)),
    ).rejects.toThrow('HOLD_INVARIANT_BREACH')

    // Rolled back: claimedQty untouched, stock untouched.
    const line = await firstLine(requestId)
    expect(line?.claimedQty).toBe(0)
    const stock = await getStock(item.id, hub.id)
    expect(stock?.quantity).toBe(2)
    expect(stock?.reservedQty).toBe(4)
  })

  it('drawReservedFromHub is guarded on both quantity and reservedQty (never negative)', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 3 })
    await seedInventoryStock(item.id, hub.id, 3)
    // reservedQty is 0 here → guard must refuse to draw a "reserved" amount.
    const drawn = await drawReservedFromHub(item.id, hub.id, 2, prisma)
    expect(drawn).toBe(0)
    const stock = await getStock(item.id, hub.id)
    expect(stock?.quantity).toBe(3) // unchanged
    expect(stock?.reservedQty).toBe(0) // never driven negative
  })

  it('H4: setStockAtHub cannot drop quantity below committed reservedQty', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const operator = await createOperator()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    await seedInventoryStock(item.id, hub.id, 10)
    await reserveAndFulfill(hub.id, item.id, 4, operator.id) // reservedQty = 4 (held)

    // Admin tries to set stock below the reserve — floored at reservedQty.
    await setStockAtHub(item.id, hub.id, 2)
    let stock = await getStock(item.id, hub.id)
    expect(stock?.quantity).toBe(4) // GREATEST(2, reservedQty=4)
    expect(stock?.reservedQty).toBe(4)

    // Raising stock works normally.
    await setStockAtHub(item.id, hub.id, 20)
    stock = await getStock(item.id, hub.id)
    expect(stock?.quantity).toBe(20)
  })

  it('M2: a hub-substituted line holds and claims the SUBSTITUTED item', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const operator = await createOperator()
    const requested = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 0 })
    const substitute = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    await seedInventoryStock(substitute.id, hub.id, 10)

    const requestId = await createRequest(
      {
        requestType: 'RESERVATION',
        status: 'REQUESTED',
        fulfillerHubId: hub.id,
        lines: [{ lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 3, specificInventoryItemId: requested.id }],
      },
      operator.id,
    )
    const line = await firstLine(requestId)
    // Hub substitutes requested → substitute (EDITED, keeps qty 3).
    await setLineFulfillment(line!.id, {
      status: 'EDITED',
      substitutedItemId: substitute.id,
      fulfilledQty: 3,
      actor: { label: 'test' },
    })

    expect(await applyRequestTransition(requestId, 'confirm', 'RESERVATION')).toEqual({ ok: true })
    // Reserve landed on the SUBSTITUTE, not the requested item.
    expect((await getStock(substitute.id, hub.id))?.reservedQty).toBe(3)

    expect(await applyRequestTransition(requestId, 'fulfill', 'RESERVATION')).toEqual({ ok: true })
    const held = await firstLine(requestId)
    expect(held?.heldItemId).toBe(substitute.id)

    // Claiming the requested item finds no hold; claiming the substitute converts it.
    expect(await prisma.$transaction((tx) => claimHeldStock(operator.id, requested.id, hub.id, 3, tx))).toBe(0)
    expect(await prisma.$transaction((tx) => claimHeldStock(operator.id, substitute.id, hub.id, 3, tx))).toBe(3)
    const stock = await getStock(substitute.id, hub.id)
    expect(stock?.quantity).toBe(7)
    expect(stock?.reservedQty).toBe(0)
  })
})
