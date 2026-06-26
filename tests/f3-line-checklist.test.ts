import { describe, it, expect } from 'vitest'
import { prisma } from '../src/lib/prisma'
import {
  createRequest,
  applyRequestTransition,
  setLineFulfillment,
  getLineChecklist,
} from '../src/lib/deployment-requests'
import {
  createHub,
  createCategory,
  createInventoryItem,
  createInventoryUnit,
  createOperator,
  seedInventoryStock,
} from './helpers/fixtures'

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getLineIds(requestId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "deployment_request_lines"
    WHERE "requestId" = ${requestId}
    ORDER BY "createdAt" ASC
  `
  return rows.map((r) => r.id)
}

async function getLineEvents(lineId: string) {
  return prisma.$queryRaw<{
    action: string
    fromQty: number | null
    toQty: number | null
    fromItemId: string | null
    toItemId: string | null
  }[]>`
    SELECT "action", "fromQty", "toQty", "fromItemId", "toItemId"
    FROM "request_line_events"
    WHERE "lineId" = ${lineId}
    ORDER BY "createdAt" ASC
  `
}

async function getStockRow(itemId: string, hubId: string) {
  const rows = await prisma.$queryRaw<{ quantity: number; reservedQty: number }[]>`
    SELECT "quantity", "reservedQty" FROM "inventory_stock"
    WHERE "itemId" = ${itemId} AND "hubId" = ${hubId}
  `
  return rows[0] ?? null
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('F3 hub loading checklist', () => {
  // (a) Stage with any PENDING line → PENDING_LINES
  it('rejects staging when any line is still PENDING', async () => {
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
        lines: [
          { lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 3, specificInventoryItemId: item.id },
        ],
      },
      operator.id,
    )

    // Stage without checking any lines → must be rejected
    const result = await applyRequestTransition(requestId, 'confirm', 'RESERVATION')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('PENDING_LINES')

    // Request status must stay REQUESTED
    const rows = await prisma.$queryRaw<{ status: string }[]>`
      SELECT "status"::text AS "status" FROM "deployment_requests" WHERE "id" = ${requestId}
    `
    expect(rows[0]?.status).toBe('REQUESTED')
  })

  // (b) Confirm/Edit/Deny then stage → reserves EDITED fulfilledQty for effective item, DENIED skipped
  it('uses fulfilledQty and effective item for reserves; skips DENIED lines', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const operator = await createOperator()
    const itemA = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 20 })
    const itemB = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 20 })
    const itemC = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 5 })
    await seedInventoryStock(itemA.id, hub.id, 20)
    await seedInventoryStock(itemB.id, hub.id, 20)
    await seedInventoryStock(itemC.id, hub.id, 5)

    const requestId = await createRequest(
      {
        requestType: 'RESERVATION',
        status: 'REQUESTED',
        fulfillerHubId: hub.id,
        lines: [
          // Line 1: CONFIRMED as-requested (qty 5)
          { lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 5, specificInventoryItemId: itemA.id },
          // Line 2: EDITED — qty adjusted to 3, substituted to itemB
          { lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 7, specificInventoryItemId: itemC.id },
          // Line 3: DENIED — should reserve nothing
          { lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 4, specificInventoryItemId: itemA.id },
        ],
      },
      operator.id,
    )

    const [lineIdA, lineIdB, lineIdC] = await getLineIds(requestId)

    // Confirm line 1 as-requested
    const r1 = await setLineFulfillment(lineIdA, { status: 'CONFIRMED', actor: { label: 'hub' } })
    expect(r1.ok).toBe(true)

    // Edit line 2: qty 3, substitute itemB
    const r2 = await setLineFulfillment(lineIdB, {
      status: 'EDITED',
      fulfilledQty: 3,
      substitutedItemId: itemB.id,
      actor: { label: 'hub' },
    })
    expect(r2.ok).toBe(true)

    // Deny line 3
    const r3 = await setLineFulfillment(lineIdC, {
      status: 'DENIED',
      denyReason: 'out of stock',
      actor: { label: 'hub' },
    })
    expect(r3.ok).toBe(true)

    // Stage — all checked
    const stageResult = await applyRequestTransition(requestId, 'confirm', 'RESERVATION')
    expect(stageResult).toEqual({ ok: true })

    // itemA reserved: 5 (CONFIRMED, original item, original qty)
    const stockA = await getStockRow(itemA.id, hub.id)
    expect(stockA?.reservedQty).toBe(5)

    // itemB reserved: 3 (EDITED, effective item=itemB, effective qty=3)
    const stockB = await getStockRow(itemB.id, hub.id)
    expect(stockB?.reservedQty).toBe(3)

    // itemC reserved: 0 (DENIED)
    const stockC = await getStockRow(itemC.id, hub.id)
    expect(stockC?.reservedQty).toBe(0)
  })

  // (c) SERIALIZED line requires a unit to confirm
  it('rejects CONFIRMED for a SERIALIZED line without resolvedUnitId', async () => {
    const cat = await createCategory()
    const operator = await createOperator()
    const serialItem = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 1 })

    const requestId = await createRequest(
      {
        requestType: 'RESERVATION',
        status: 'REQUESTED',
        lines: [
          { lineType: 'KIT_ITEM', itemType: 'SERIALIZED', requestedQty: 1, specificInventoryItemId: serialItem.id },
        ],
      },
      operator.id,
    )

    const [lineId] = await getLineIds(requestId)

    // Confirm without unit → error
    const noUnit = await setLineFulfillment(lineId, { status: 'CONFIRMED', actor: { label: 'hub' } })
    expect(noUnit.ok).toBe(false)
    expect(noUnit.error).toMatch(/unit/i)

    // Confirm WITH a unit → succeeds
    const unit = await createInventoryUnit(serialItem.id)
    const withUnit = await setLineFulfillment(lineId, {
      status: 'CONFIRMED',
      resolvedUnitId: unit.id,
      actor: { label: 'hub' },
    })
    expect(withUnit.ok).toBe(true)
  })

  // (d) Every action appends a request_line_events row with from→to
  it('appends a request_line_events row for every Confirm/Edit/Deny', async () => {
    const cat = await createCategory()
    const operator = await createOperator()
    const itemA = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    const itemB = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })

    const requestId = await createRequest(
      {
        requestType: 'RESERVATION',
        status: 'REQUESTED',
        lines: [
          { lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 8, specificInventoryItemId: itemA.id },
        ],
      },
      operator.id,
    )

    const [lineId] = await getLineIds(requestId)

    // First action: CONFIRM (from: qty=8, item=itemA → to: qty=8, item=itemA)
    await setLineFulfillment(lineId, { status: 'CONFIRMED', actor: { label: 'hub-op' } })
    let events = await getLineEvents(lineId)
    expect(events).toHaveLength(1)
    expect(events[0]?.action).toBe('CONFIRM')
    expect(Number(events[0]?.fromQty)).toBe(8)  // from original requestedQty
    expect(Number(events[0]?.toQty)).toBe(8)    // to fulfilledQty = requestedQty
    expect(events[0]?.fromItemId).toBe(itemA.id)
    expect(events[0]?.toItemId).toBe(itemA.id)

    // Re-action: EDIT with new qty and substitute item
    await setLineFulfillment(lineId, {
      status: 'EDITED',
      fulfilledQty: 5,
      substitutedItemId: itemB.id,
      actor: { label: 'hub-op' },
    })
    events = await getLineEvents(lineId)
    expect(events).toHaveLength(2)
    expect(events[1]?.action).toBe('EDIT')
    expect(Number(events[1]?.fromQty)).toBe(8)   // prior fulfilledQty was 8
    expect(Number(events[1]?.toQty)).toBe(5)
    expect(events[1]?.fromItemId).toBe(itemA.id) // prior effective item
    expect(events[1]?.toItemId).toBe(itemB.id)   // new substitute

    // Re-action again: DENY
    await setLineFulfillment(lineId, { status: 'DENIED', denyReason: 'broken', actor: { label: 'hub-op' } })
    events = await getLineEvents(lineId)
    expect(events).toHaveLength(3)
    expect(events[2]?.action).toBe('DENY')
    expect(events[2]?.toQty).toBeNull()
  })

  // (e) Staging creates a requester Notification summarizing changes
  it('creates a Notification for the requester on stage', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const operator = await createOperator()
    const itemA = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    const itemB = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    await seedInventoryStock(itemA.id, hub.id, 10)
    await seedInventoryStock(itemB.id, hub.id, 10)

    const requestId = await createRequest(
      {
        requestType: 'RESERVATION',
        status: 'REQUESTED',
        fulfillerHubId: hub.id,
        lines: [
          { lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 4, specificInventoryItemId: itemA.id },
          { lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 3, specificInventoryItemId: itemB.id },
        ],
      },
      operator.id,
    )

    const [lineIdA, lineIdB] = await getLineIds(requestId)

    // EDITED line A (qty adjusted) + DENIED line B
    await setLineFulfillment(lineIdA, { status: 'EDITED', fulfilledQty: 2, actor: { label: 'hub' } })
    await setLineFulfillment(lineIdB, { status: 'DENIED', denyReason: 'none in stock', actor: { label: 'hub' } })

    await applyRequestTransition(requestId, 'confirm', 'RESERVATION')

    const notifications = await prisma.notification.findMany({
      where: { userId: operator.id, type: 'RESERVATION_UPDATE' },
      orderBy: { createdAt: 'desc' },
    })

    expect(notifications.length).toBeGreaterThan(0)
    const latest = notifications[0]!
    expect(latest.title).toBe('Reservation staged')
    // Body should mention "adjusted" and "denied"
    expect(latest.body).toMatch(/adjusted/i)
    expect(latest.body).toMatch(/denied/i)
    expect(latest.link).toBe('/operator/requests')
  })

  // Bonus: getLineChecklist returns correct progress + available units + substitutable items
  it('getLineChecklist returns progress and enriched line data', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const operator = await createOperator()
    const consumable = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 5, name: 'Sample Bags' })
    const substitute = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 3, name: 'Alt Bags' })
    const serialItem = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 2, name: 'GPS Unit' })
    await seedInventoryStock(consumable.id, hub.id, 5)
    await seedInventoryStock(substitute.id, hub.id, 3)
    const unit = await createInventoryUnit(serialItem.id)

    const requestId = await createRequest(
      {
        requestType: 'RESERVATION',
        status: 'REQUESTED',
        fulfillerHubId: hub.id,
        lines: [
          { lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 2, specificInventoryItemId: consumable.id },
          { lineType: 'KIT_ITEM', itemType: 'SERIALIZED', requestedQty: 1, specificInventoryItemId: serialItem.id },
        ],
      },
      operator.id,
    )

    // Initially all PENDING
    const { lines: initial, progress: p0 } = await getLineChecklist(requestId, hub.id)
    expect(p0.checked).toBe(0)
    expect(p0.total).toBe(2)

    // Substitutable items should include 'Alt Bags' (same category, different item)
    const consumableLine = initial.find((l) => l.itemType === 'CONSUMABLE')
    expect(consumableLine?.substitutableItems.some((s) => s.name === 'Alt Bags')).toBe(true)

    // SERIALIZED line should have the available unit
    const serialLine = initial.find((l) => l.itemType === 'SERIALIZED')
    expect(serialLine?.availableUnits.some((u) => u.id === unit.id)).toBe(true)

    // Check off both lines
    const [lineIdA, lineIdB] = await getLineIds(requestId)
    await setLineFulfillment(lineIdA, { status: 'CONFIRMED', actor: { label: 'hub' } })
    await setLineFulfillment(lineIdB, {
      status: 'CONFIRMED',
      resolvedUnitId: unit.id,
      actor: { label: 'hub' },
    })

    const { progress: p2 } = await getLineChecklist(requestId, hub.id)
    expect(p2.checked).toBe(2)
    expect(p2.total).toBe(2)
  })
})
