import { describe, it, expect } from 'vitest'
import { prisma } from '../src/lib/prisma'
import {
  createRequest,
  applyRequestTransition,
  setLineFulfillment,
} from '../src/lib/deployment-requests'
import { seedInventoryStock } from './helpers/fixtures'
import { createHub, createCategory, createInventoryItem, createInventoryUnit, createOperator } from './helpers/fixtures'

async function getStockRow(itemId: string, hubId: string) {
  const rows = await prisma.$queryRaw<{ quantity: number; reservedQty: number }[]>`
    SELECT "quantity", "reservedQty" FROM "inventory_stock" WHERE "itemId" = ${itemId} AND "hubId" = ${hubId}
  `
  return rows[0] ?? null
}

async function getRequestRow(id: string) {
  const rows = await prisma.$queryRaw<{ status: string; stockReservedAt: Date | null }[]>`
    SELECT "status"::text AS "status", "stockReservedAt" FROM "deployment_requests" WHERE "id" = ${id}
  `
  return rows[0] ?? null
}

async function getLineIds(requestId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "deployment_request_lines"
    WHERE "requestId" = ${requestId}
    ORDER BY "createdAt" ASC
  `
  return rows.map((r) => r.id)
}

/** F3: confirm all lines (CONFIRMED, as-requested) so the PENDING gate passes. */
async function confirmAllLines(requestId: string): Promise<void> {
  const lineIds = await getLineIds(requestId)
  for (const lineId of lineIds) {
    await setLineFulfillment(lineId, { status: 'CONFIRMED', actor: { label: 'test' } })
  }
}

describe('R4 hub-stock hard-reserve', () => {
  it('reserves consumable stock on confirm and releases on cancel', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const operator = await createOperator()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    await seedInventoryStock(item.id, hub.id, 10)

    const requestId = await createRequest(
      {
        requestType: 'RESERVATION',
        status: 'REQUESTED',
        fulfillerHubId: hub.id,
        lines: [{ lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 3, specificInventoryItemId: item.id }],
      },
      operator.id,
    )

    // Before confirm: nothing reserved
    const before = await getStockRow(item.id, hub.id)
    expect(before?.reservedQty).toBe(0)

    // F3: check off all lines first
    await confirmAllLines(requestId)

    // Confirm stages the request and reserves stock
    const confirmResult = await applyRequestTransition(requestId, 'confirm', 'RESERVATION')
    expect(confirmResult).toEqual({ ok: true })

    const afterConfirm = await getStockRow(item.id, hub.id)
    expect(afterConfirm?.reservedQty).toBe(3)

    const reqAfterConfirm = await getRequestRow(requestId)
    expect(reqAfterConfirm?.status).toBe('STAGED')
    expect(reqAfterConfirm?.stockReservedAt).not.toBeNull()

    // Cancel releases the reserve
    const cancelResult = await applyRequestTransition(requestId, 'cancel', 'RESERVATION')
    expect(cancelResult).toEqual({ ok: true })

    const afterCancel = await getStockRow(item.id, hub.id)
    expect(afterCancel?.reservedQty).toBe(0)

    const reqAfterCancel = await getRequestRow(requestId)
    expect(reqAfterCancel?.status).toBe('CANCELLED')
    expect(reqAfterCancel?.stockReservedAt).toBeNull()
  })

  it('returns INSUFFICIENT_STOCK and rolls back when not enough available', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const operator = await createOperator()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 2 })
    await seedInventoryStock(item.id, hub.id, 2)

    const requestId = await createRequest(
      {
        requestType: 'RESERVATION',
        status: 'REQUESTED',
        fulfillerHubId: hub.id,
        lines: [{ lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 5, specificInventoryItemId: item.id }],
      },
      operator.id,
    )

    // F3: confirm all lines (even though qty > stock, the gate must pass before reserve check)
    await confirmAllLines(requestId)

    const result = await applyRequestTransition(requestId, 'confirm', 'RESERVATION')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('INSUFFICIENT_STOCK')
      expect(result.shortItems).toContain(item.name)
    }

    // Status must NOT have flipped (transaction rolled back)
    const req = await getRequestRow(requestId)
    expect(req?.status).toBe('REQUESTED')
    expect(req?.stockReservedAt).toBeNull()

    // reservedQty must be unchanged
    const stock = await getStockRow(item.id, hub.id)
    expect(stock?.reservedQty).toBe(0)
  })

  it('HOLDS the reserve on fulfill (UR-010) — does not release it back to free stock', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const operator = await createOperator()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    await seedInventoryStock(item.id, hub.id, 10)

    const requestId = await createRequest(
      {
        requestType: 'RESERVATION',
        status: 'REQUESTED',
        fulfillerHubId: hub.id,
        lines: [{ lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 4, specificInventoryItemId: item.id }],
      },
      operator.id,
    )

    await confirmAllLines(requestId)
    await applyRequestTransition(requestId, 'confirm', 'RESERVATION')
    const afterConfirm = await getStockRow(item.id, hub.id)
    expect(afterConfirm?.reservedQty).toBe(4)

    const fulfillResult = await applyRequestTransition(requestId, 'fulfill', 'RESERVATION')
    expect(fulfillResult).toEqual({ ok: true })

    // UR-010: the reserve is HELD for the operator (converted at claim/checkout),
    // NOT released here — releasing at fulfill was the reservation-leak bug.
    const afterFulfill = await getStockRow(item.id, hub.id)
    expect(afterFulfill?.reservedQty).toBe(4)

    // The hold is snapshotted onto the line (see ur010-hold-through-claim.test.ts).
    const held = await prisma.$queryRaw<{ heldQty: number; heldItemId: string | null }[]>`
      SELECT "heldQty", "heldItemId" FROM "deployment_request_lines" WHERE "requestId" = ${requestId}
    `
    expect(held[0]?.heldQty).toBe(4)
    expect(held[0]?.heldItemId).toBe(item.id)

    const req = await getRequestRow(requestId)
    expect(req?.status).toBe('FULFILLED')
    // stockReservedAt stays set — the reserve is still live as the hold.
    expect(req?.stockReservedAt).not.toBeNull()
  })

  it('double-confirm is idempotency-guarded (second confirm returns STATE_MISMATCH)', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const operator = await createOperator()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    await seedInventoryStock(item.id, hub.id, 10)

    const requestId = await createRequest(
      {
        requestType: 'RESERVATION',
        status: 'REQUESTED',
        fulfillerHubId: hub.id,
        lines: [{ lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 2, specificInventoryItemId: item.id }],
      },
      operator.id,
    )

    await confirmAllLines(requestId)

    const first = await applyRequestTransition(requestId, 'confirm', 'RESERVATION')
    expect(first.ok).toBe(true)

    const second = await applyRequestTransition(requestId, 'confirm', 'RESERVATION')
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.code).toBe('STATE_MISMATCH')

    // reservedQty must only be 2, not 4
    const stock = await getStockRow(item.id, hub.id)
    expect(stock?.reservedQty).toBe(2)
  })

  it('skips reserve when no fulfillerHubId is set', async () => {
    const cat = await createCategory()
    const operator = await createOperator()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })

    // No hub assigned on the request
    const requestId = await createRequest(
      {
        requestType: 'RESERVATION',
        status: 'REQUESTED',
        fulfillerHubId: null,
        lines: [{ lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 3, specificInventoryItemId: item.id }],
      },
      operator.id,
    )

    await confirmAllLines(requestId)

    const result = await applyRequestTransition(requestId, 'confirm', 'RESERVATION')
    expect(result).toEqual({ ok: true })

    const req = await getRequestRow(requestId)
    expect(req?.status).toBe('STAGED')
  })

  it('skips reserve for SERIALIZED and category-only KIT_ITEM lines', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const operator = await createOperator()
    const serialItem = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 1 })
    const unit = await createInventoryUnit(serialItem.id)

    const requestId = await createRequest(
      {
        requestType: 'RESERVATION',
        status: 'REQUESTED',
        fulfillerHubId: hub.id,
        lines: [
          // Category-only line (no specificInventoryItemId)
          { lineType: 'KIT_ITEM', itemType: null, requestedQty: 1, categoryId: cat.id },
          // Serialized item line — no inventory_stock row
          { lineType: 'KIT_ITEM', itemType: 'SERIALIZED', requestedQty: 1, specificInventoryItemId: serialItem.id },
        ],
      },
      operator.id,
    )

    const [catLineId, serialLineId] = await getLineIds(requestId)

    // Category-only: confirm with no unit
    await setLineFulfillment(catLineId, { status: 'CONFIRMED', actor: { label: 'test' } })
    // Serialized: confirm with unit
    await setLineFulfillment(serialLineId, {
      status: 'CONFIRMED',
      resolvedUnitId: unit.id,
      actor: { label: 'test' },
    })

    const result = await applyRequestTransition(requestId, 'confirm', 'RESERVATION')
    expect(result).toEqual({ ok: true })

    const req = await getRequestRow(requestId)
    expect(req?.status).toBe('STAGED')
  })
})
