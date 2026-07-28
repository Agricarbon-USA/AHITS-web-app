import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { randomUUID } from 'crypto'
import { NextRequest } from 'next/server'
import { POST as cron } from '../src/app/api/cron/dispatch/route'
import { createAlert } from '../src/lib/alerts'
import { prisma } from '../src/lib/prisma'
import {
  createOperator,
  createCategory,
  createInventoryItem,
  createInventoryUnit,
  createRig,
} from './helpers/fixtures'

// CC-31 item 1 (review §3.1): the INV-5 "custody strand" detector cried wolf on the
// first end-of-deployment. End legitimately leaves a GOOD serialized unit IN_TRANSIT
// awaiting hub receipt (with a HUB_RETURN link) and a TRANSFER disposition's unit
// CHECKED_OUT on an ENDED rig with an open kit item — both looked strandless. The fixed
// second OR arm (a) age-qualifies past 72h and (b) excludes units explained by an active
// HUB_RETURN link or a PENDING transfer. Each test below isolates ONE arm.

// Spy on alerts; the cron calls the mocked createAlert/resolveActiveAlert. The CRON_SILENT
// constants are re-exported verbatim (the cron imports them from this module).
vi.mock('../src/lib/alerts', () => ({
  createAlert: vi.fn().mockResolvedValue({}),
  resolveActiveAlert: vi.fn().mockResolvedValue({}),
  CRON_SILENT_SOURCE_TABLE: 'system',
  CRON_SILENT_SOURCE_ID: 'cron-dispatch',
}))
// Keep the cron test focused on the INV-5 query — the dispatch step is unrelated.
vi.mock('../src/lib/notifications', () => ({
  dispatchPendingAlerts: vi.fn().mockResolvedValue({ notified: 0 }),
}))

const INV5 = ['INVENTORY_DRIFT', 'inventory_units', 'inv5-custody-strands'] as const

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

/** Push a unit's updatedAt into the past ( @updatedAt can't be set via prisma.update ). */
async function ageUnit(unitId: string, days: number) {
  await prisma.$executeRaw`
    UPDATE "inventory_units" SET "updatedAt" = now() - make_interval(days => ${days})
    WHERE "id" = ${unitId}
  `
}

function raisedInv5() {
  return vi.mocked(createAlert).mock.calls.some(
    (c) => c[0] === INV5[0] && c[1] === INV5[1] && c[2] === INV5[2],
  )
}

describe('CC-31 §3.1: INV-5 custody-strand detector no longer cries wolf', () => {
  beforeEach(() => {
    vi.mocked(createAlert).mockClear()
  })

  it('1a age: a FRESH strandless IN_TRANSIT unit (<72h) does NOT raise', async () => {
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED' })
    await createInventoryUnit(item.id, { status: 'IN_TRANSIT' }) // updatedAt = now

    await runCron()
    expect(raisedInv5()).toBe(false)
  })

  it('1b-i link: an aged unit with an active HUB_RETURN link does NOT raise', async () => {
    const op = await createOperator()
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED' })
    const unit = await createInventoryUnit(item.id, { status: 'IN_TRANSIT' })
    // fresh, un-expired HUB_RETURN link awaiting hub receipt
    await prisma.statusLink.create({
      data: {
        type: 'HUB_RETURN',
        state: 'ISSUED',
        tokenHash: `test-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
        inventoryUnitId: unit.id,
        createdById: op.id,
      },
    })
    await ageUnit(unit.id, 4) // past 72h — only the link keeps it out

    await runCron()
    expect(raisedInv5()).toBe(false)
  })

  it('1b-ii transfer: an aged unit with a PENDING transfer (matched via kit item) does NOT raise', async () => {
    const op = await createOperator()
    const recipient = await createOperator()
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED' })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op.id)
    // TRANSFER disposition leaves the kit item OPEN on an ENDED rig
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, inventoryUnitId: unit.id },
    })
    await prisma.rig.update({ where: { id: rig.id }, data: { endedAt: new Date() } })
    // the end route creates TransferItem rows with kitItemId only — the load-bearing match
    await prisma.transferRequest.create({
      data: {
        fromRigId: rig.id,
        toOperatorId: recipient.id,
        initiatedById: op.id,
        note: 'fixture transfer',
        status: 'PENDING',
        items: { create: [{ kitItemId: kitItem.id }] },
      },
    })
    await ageUnit(unit.id, 4) // past 72h — only the pending transfer keeps it out

    await runCron()
    expect(raisedInv5()).toBe(false)
  })

  it('raises INV-5 once a unit is aged past 72h with no explaining flow', async () => {
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED' })
    const unit = await createInventoryUnit(item.id, { status: 'IN_TRANSIT' })
    await ageUnit(unit.id, 4) // aged, no link, no transfer, no open kit item

    await runCron()
    expect(raisedInv5()).toBe(true)
  })
})
