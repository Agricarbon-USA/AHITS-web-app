import { describe, it, expect } from 'vitest'
import { prisma } from '../src/lib/prisma'
import {
  createRequest,
  applyRequestTransition,
  setLineFulfillment,
  claimHeldStock,
  releaseAllHeldForRequest,
  getAwaitingPickupForOperator,
} from '../src/lib/deployment-requests'
import { resyncItemTotal } from '../src/lib/inventory-stock'
import { seedInventoryStock, createHub, createCategory, createInventoryItem, createOperator } from './helpers/fixtures'

// ── CC-09 Awaiting Pickup ─────────────────────────────────────────────────────
// Acceptance criteria:
//   #3 (TTL race):     a hold with holdExpiresAt in the future is NOT released
//                      by the TTL sweep, even when fulfilledAt is past HOLD_TTL_HOURS.
//   #4 (residual-hold zombie): after a partial pickup, unclaimed lines are released
//                              so the card disappears.

async function getStockRow(itemId: string, hubId: string) {
  const rows = await prisma.$queryRaw<{ quantity: number; reservedQty: number }[]>`
    SELECT "quantity", "reservedQty" FROM "inventory_stock" WHERE "itemId" = ${itemId} AND "hubId" = ${hubId}
  `
  return rows[0] ?? null
}

async function getRequestHoldExpiry(requestId: string) {
  const rows = await prisma.$queryRaw<{ holdExpiresAt: Date | null }[]>`
    SELECT "holdExpiresAt" FROM "deployment_requests" WHERE "id" = ${requestId}
  `
  return rows[0]?.holdExpiresAt ?? null
}

async function setFulfilledAtInPast(requestId: string, hoursAgo: number) {
  const pastTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000)
  await prisma.$executeRaw`
    UPDATE "deployment_requests" SET "fulfilledAt" = ${pastTime} WHERE "id" = ${requestId}
  `
}

async function confirmAllLines(requestId: string): Promise<void> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "deployment_request_lines" WHERE "requestId" = ${requestId} ORDER BY "createdAt" ASC
  `
  for (const { id } of rows) {
    await setLineFulfillment(id, { status: 'CONFIRMED', actor: { label: 'test' } })
  }
}

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

describe('CC-09 awaiting pickup', () => {
  describe('TTL race fix (acceptance #3)', () => {
    it('snapshotHeldLines sets holdExpiresAt in the future when consumable lines exist', async () => {
      const hub = await createHub()
      const cat = await createCategory()
      const operator = await createOperator()
      const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
      await seedInventoryStock(item.id, hub.id, 10)

      const requestId = await reserveAndFulfill(hub.id, item.id, 3, operator.id)

      const holdExpiresAt = await getRequestHoldExpiry(requestId)
      expect(holdExpiresAt).not.toBeNull()
      // holdExpiresAt must be in the future (at least 1h from now)
      expect(holdExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 60 * 60 * 1000)
    })

    it('a hold with holdExpiresAt in the future is NOT swept by the TTL cron condition', async () => {
      const hub = await createHub()
      const cat = await createCategory()
      const operator = await createOperator()
      const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
      await seedInventoryStock(item.id, hub.id, 10)

      const requestId = await reserveAndFulfill(hub.id, item.id, 4, operator.id)

      // Simulate: fulfilledAt is 100h ago (past the 72h HOLD_TTL_HOURS default),
      // BUT holdExpiresAt is still in the future (set to ~168h from fulfill time).
      await setFulfilledAtInPast(requestId, 100)

      // The cron query: stale = fulfilledAt < cutoff AND (holdExpiresAt IS NULL OR holdExpiresAt < NOW())
      // Since holdExpiresAt is in the future, this request should NOT appear in the stale set.
      const holdTtlHours = 72
      const cutoff = new Date(Date.now() - holdTtlHours * 60 * 60 * 1000)
      const staleReqs = await prisma.$queryRaw<{ requestId: string }[]>`
        SELECT DISTINCT l."requestId" AS "requestId"
        FROM "deployment_request_lines" l
        JOIN "deployment_requests" r ON r."id" = l."requestId"
        WHERE l."releasedAt" IS NULL
          AND l."heldQty" > l."claimedQty"
          AND r."status" = 'FULFILLED'
          AND r."fulfilledAt" < ${cutoff}
          AND (r."holdExpiresAt" IS NULL OR r."holdExpiresAt" < NOW())
      `
      const found = staleReqs.find((r) => r.requestId === requestId)
      expect(found).toBeUndefined()

      // Verify the hold is still intact
      const stock = await getStockRow(item.id, hub.id)
      expect(stock?.reservedQty).toBe(4)
    })

    it('a hold with expired holdExpiresAt IS swept by the TTL cron condition', async () => {
      const hub = await createHub()
      const cat = await createCategory()
      const operator = await createOperator()
      const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
      await seedInventoryStock(item.id, hub.id, 10)

      const requestId = await reserveAndFulfill(hub.id, item.id, 4, operator.id)

      // Simulate: both fulfilledAt and holdExpiresAt are well in the past
      await setFulfilledAtInPast(requestId, 200)
      await prisma.$executeRaw`
        UPDATE "deployment_requests"
        SET "holdExpiresAt" = NOW() - make_interval(hours => 10)
        WHERE "id" = ${requestId}
      `

      const holdTtlHours = 72
      const cutoff2 = new Date(Date.now() - holdTtlHours * 60 * 60 * 1000)
      const staleReqs = await prisma.$queryRaw<{ requestId: string }[]>`
        SELECT DISTINCT l."requestId" AS "requestId"
        FROM "deployment_request_lines" l
        JOIN "deployment_requests" r ON r."id" = l."requestId"
        WHERE l."releasedAt" IS NULL
          AND l."heldQty" > l."claimedQty"
          AND r."status" = 'FULFILLED'
          AND r."fulfilledAt" < ${cutoff2}
          AND (r."holdExpiresAt" IS NULL OR r."holdExpiresAt" < NOW())
      `
      const found = staleReqs.find((r) => r.requestId === requestId)
      expect(found).toBeDefined()
    })
  })

  describe('residual-hold zombie fix (acceptance #4)', () => {
    it('after partial pickup, unreleased lines are released and card disappears', async () => {
      const hub = await createHub()
      const cat = await createCategory()
      const operator = await createOperator()
      const item1 = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
      const item2 = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
      await seedInventoryStock(item1.id, hub.id, 10)
      await seedInventoryStock(item2.id, hub.id, 10)

      // Request with two held lines
      const requestId = await createRequest(
        {
          requestType: 'RESERVATION',
          status: 'REQUESTED',
          fulfillerHubId: hub.id,
          lines: [
            { lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 3, specificInventoryItemId: item1.id },
            { lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 5, specificInventoryItemId: item2.id },
          ],
        },
        operator.id,
      )
      await confirmAllLines(requestId)
      expect(await applyRequestTransition(requestId, 'confirm', 'RESERVATION')).toEqual({ ok: true })
      expect(await applyRequestTransition(requestId, 'fulfill', 'RESERVATION')).toEqual({ ok: true })

      // Operator picks up only item1 (3 units), removes item2 from the pickup form
      await prisma.$transaction(async (tx) => {
        const claimed = await claimHeldStock(operator.id, item1.id, hub.id, 3, tx)
        expect(claimed).toBe(3)
        await resyncItemTotal(item1.id, tx)
      })

      // Simulate: POST /api/deployments with fromRequestId → release residuals for item2
      await prisma.$transaction((tx) => releaseAllHeldForRequest(requestId, tx))

      // item1: reserve consumed by claim (0), item2: reserve released (0)
      const stock1 = await getStockRow(item1.id, hub.id)
      const stock2 = await getStockRow(item2.id, hub.id)
      expect(stock1?.reservedQty).toBe(0)
      expect(stock2?.reservedQty).toBe(0)

      // The Awaiting Pickup surface should now be empty for this operator
      const pickups = await getAwaitingPickupForOperator(operator.id)
      const found = pickups.find((r) => r.id === requestId)
      expect(found).toBeUndefined()
    })
  })

  describe('getAwaitingPickupForOperator', () => {
    it('returns FULFILLED requests with unclaimed holds for the operator', async () => {
      const hub = await createHub()
      const cat = await createCategory()
      const operator = await createOperator()
      const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
      await seedInventoryStock(item.id, hub.id, 10)

      const requestId = await reserveAndFulfill(hub.id, item.id, 3, operator.id)

      const pickups = await getAwaitingPickupForOperator(operator.id)
      const req = pickups.find((r) => r.id === requestId)
      expect(req).toBeDefined()
      expect(req!.lines).toHaveLength(1)
      expect(req!.lines[0].heldItemId).toBe(item.id)
      expect(req!.lines[0].remainingQty).toBe(3)
    })

    it('does not return requests for a different operator', async () => {
      const hub = await createHub()
      const cat = await createCategory()
      const operator = await createOperator()
      const stranger = await createOperator()
      const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
      await seedInventoryStock(item.id, hub.id, 10)

      const requestId = await reserveAndFulfill(hub.id, item.id, 3, operator.id)

      const pickups = await getAwaitingPickupForOperator(stranger.id)
      const found = pickups.find((r) => r.id === requestId)
      expect(found).toBeUndefined()
    })

    it('does not return requests where all holds are fully claimed', async () => {
      const hub = await createHub()
      const cat = await createCategory()
      const operator = await createOperator()
      const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
      await seedInventoryStock(item.id, hub.id, 10)

      const requestId = await reserveAndFulfill(hub.id, item.id, 3, operator.id)

      // Claim all held stock
      await prisma.$transaction(async (tx) => {
        await claimHeldStock(operator.id, item.id, hub.id, 3, tx)
        await resyncItemTotal(item.id, tx)
      })

      const pickups = await getAwaitingPickupForOperator(operator.id)
      const found = pickups.find((r) => r.id === requestId)
      expect(found).toBeUndefined()
    })
  })
})
