import { describe, it, expect, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as cron } from '../src/app/api/cron/dispatch/route'
import {
  createRequest,
  applyRequestTransition,
  setLineFulfillment,
} from '../src/lib/deployment-requests'
import { prisma } from '../src/lib/prisma'
import {
  createHub,
  createCategory,
  createInventoryItem,
  createOperator,
  seedInventoryStock,
} from './helpers/fixtures'

// Step-7 regression pin (ITEM 0 warm-up): the stale-hold release swept on EVERY cron
// pass with `make_interval(hours => bigint)` — a 42883 that the bare catch swallowed as
// "held columns missing". Unclaimed holds NEVER expired; a hub's reserve froze forever.
// The fix binds the cutoff as a JS Date (lib/deployment-requests.ts:952 house pattern).
// This test creates a genuinely-stale, TTL-elapsed hold and asserts the sweep releases
// it — an outcome that was IMPOSSIBLE before the fix (the query threw first).

// Keep the run focused on the sweep — alerts and dispatch are unrelated to step 7 and the
// sweep writes its operator notification via prisma.notification directly, not this lib.
vi.mock('../src/lib/alerts', () => ({
  createAlert: vi.fn().mockResolvedValue({}),
  resolveActiveAlert: vi.fn().mockResolvedValue({}),
  CRON_SILENT_SOURCE_TABLE: 'system',
  CRON_SILENT_SOURCE_ID: 'cron-dispatch',
}))
vi.mock('../src/lib/notifications', () => ({
  dispatchPendingAlerts: vi.fn().mockResolvedValue({ notified: 0 }),
}))

beforeAll(() => {
  process.env.CRON_SECRET = 'test-cron-secret'
})

function cronReq() {
  return new NextRequest('http://localhost/api/cron/dispatch', {
    method: 'POST',
    headers: { authorization: 'Bearer test-cron-secret' },
  })
}

async function runCron() {
  const res = await cron(cronReq())
  expect(res.status).toBe(200)
}

async function firstLine(requestId: string) {
  const rows = await prisma.$queryRaw<{
    id: string; heldQty: number; claimedQty: number; releasedAt: Date | null
  }[]>`
    SELECT "id", "heldQty", "claimedQty", "releasedAt"
    FROM "deployment_request_lines" WHERE "requestId" = ${requestId} ORDER BY "createdAt" ASC
  `
  return rows[0] ?? null
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
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "deployment_request_lines" WHERE "requestId" = ${requestId} ORDER BY "createdAt" ASC
  `
  for (const { id } of rows) {
    await setLineFulfillment(id, { status: 'CONFIRMED', actor: { label: 'test' } })
  }
  expect(await applyRequestTransition(requestId, 'confirm', 'RESERVATION')).toEqual({ ok: true })
  expect(await applyRequestTransition(requestId, 'fulfill', 'RESERVATION')).toEqual({ ok: true })
  return requestId
}

describe('Step-7 stale-hold release (make_interval → JS Date cutoff)', () => {
  it('releases an unclaimed hold whose fulfilledAt is past HOLD_TTL and holdExpiresAt has elapsed', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const operator = await createOperator()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    await seedInventoryStock(item.id, hub.id, 10)

    const requestId = await reserveAndFulfill(hub.id, item.id, 4, operator.id)

    // Fresh from fulfill: heldQty=4, claimedQty=0, releasedAt NULL — but the hold is
    // deliberately TTL-protected (holdExpiresAt = now + PICKUP_HOLD_TTL, in the FUTURE).
    // A genuinely-stale hold is one whose fulfilledAt is > HOLD_TTL_HOURS (default 72h)
    // old AND whose pickup-TTL protection has elapsed. Both must be true or step 7's
    // WHERE clause (holdExpiresAt IS NULL OR < NOW) correctly excludes it.
    const before = await firstLine(requestId)
    expect(before?.heldQty).toBe(4)
    expect(before?.claimedQty).toBe(0)
    expect(before?.releasedAt).toBeNull()

    await prisma.$executeRaw`
      UPDATE "deployment_requests"
      SET "fulfilledAt" = ${new Date(Date.now() - 100 * 3_600_000)}, "holdExpiresAt" = NULL
      WHERE "id" = ${requestId}
    `

    await runCron()

    // Before the fix the sweep threw (42883) and this line stayed held forever.
    const after = await firstLine(requestId)
    expect(after?.releasedAt).not.toBeNull()

    // The reserve is freed back to stock (reservedQty → 0); quantity untouched.
    const stock = await prisma.$queryRaw<{ reservedQty: number }[]>`
      SELECT "reservedQty" FROM "inventory_stock" WHERE "itemId" = ${item.id} AND "hubId" = ${hub.id}
    `
    expect(stock[0]?.reservedQty).toBe(0)
  })

  it('does NOT release a hold still within its pickup TTL (holdExpiresAt in the future)', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const operator = await createOperator()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    await seedInventoryStock(item.id, hub.id, 10)

    const requestId = await reserveAndFulfill(hub.id, item.id, 4, operator.id)

    // Age fulfilledAt past the TTL but leave holdExpiresAt in the future — the pickup
    // window is still open, so the sweep must leave this hold alone.
    await prisma.$executeRaw`
      UPDATE "deployment_requests"
      SET "fulfilledAt" = ${new Date(Date.now() - 100 * 3_600_000)},
          "holdExpiresAt" = ${new Date(Date.now() + 48 * 3_600_000)}
      WHERE "id" = ${requestId}
    `

    await runCron()

    const after = await firstLine(requestId)
    expect(after?.releasedAt).toBeNull()
  })
})
