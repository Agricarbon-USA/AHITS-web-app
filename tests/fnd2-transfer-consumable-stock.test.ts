import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as addItems, DELETE as bulkReturn } from '../src/app/api/deployments/[id]/items/route'
import { POST as transferItems } from '../src/app/api/deployments/[id]/transfer/route'
import { POST as acceptTransfer } from '../src/app/api/transfers/[id]/accept/route'
import { prisma } from '../src/lib/prisma'
import {
  createOperator, createCategory, createInventoryItem, createRig, operatorSession,
  createHub, seedInventoryStock,
} from './helpers/fixtures'

// FND-2: when a CONSUMABLE is transferred between operators, the drawn-from-hub
// accounting (drawnQuantity/drawnHubId) must ride along to the destination kit
// item, split so the total is conserved. Before the fix the destination item was
// created with drawnQuantity:0, so a later HUB return restored min(qty, 0) = 0 and
// the stock drawn at checkout was permanently lost. These pin the full- and
// partial-transfer paths.

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () =>
    Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/alerts', () => ({ createAlert: vi.fn().mockResolvedValue({}) }))

let keyCounter = 0
function jsonReq(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `fnd2-key-${++keyCounter}` },
  })
}

async function addConsumable(rigId: string, inventoryItemId: string, quantity: number, sourceHubId: string) {
  const res = await addItems(
    jsonReq(`http://localhost/api/deployments/${rigId}/items`, 'POST', {
      items: [{ itemType: 'CONSUMABLE', inventoryItemId, quantity }],
      note: 'checkout',
      photoUrls: [],
      sourceHubId,
    }),
    { params: Promise.resolve({ id: rigId }) },
  )
  expect(res.status).toBe(200)
}

async function openKitItem(rigId: string, inventoryItemId: string) {
  const ki = await prisma.kitItem.findFirst({
    where: { kit: { rigId }, inventoryItemId, removedAt: null },
  })
  if (!ki) throw new Error('kit item not found')
  return ki
}

async function returnToHub(rigId: string, kitItemId: string, quantity: number, hubId: string) {
  const res = await bulkReturn(
    jsonReq(`http://localhost/api/deployments/${rigId}/items`, 'DELETE', {
      note: 'return',
      itemDispositions: [{ kitItemId, type: 'HUB', quantity, returnCondition: 'GOOD', hubId }],
    }),
    { params: Promise.resolve({ id: rigId }) },
  )
  expect(res.status).toBe(200)
}

async function stockAtHub(itemId: string, hubId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ quantity: number }[]>`
    SELECT "quantity" FROM "inventory_stock" WHERE "itemId" = ${itemId} AND "hubId" = ${hubId}
  `
  return rows[0]?.quantity ?? 0
}

async function total(itemId: string): Promise<number> {
  return (await prisma.inventoryItem.findUnique({ where: { id: itemId } }))?.quantity ?? -1
}

describe('FND-2 — consumable stock survives a transfer round-trip', () => {
  let op1: Awaited<ReturnType<typeof createOperator>>
  let op2: Awaited<ReturnType<typeof createOperator>>
  let cat: Awaited<ReturnType<typeof createCategory>>
  let hub: Awaited<ReturnType<typeof createHub>>
  let item: Awaited<ReturnType<typeof createInventoryItem>>

  beforeEach(async () => {
    op1 = await createOperator({ email: 'fnd2-op1@test.com', name: 'Op1' })
    op2 = await createOperator({ email: 'fnd2-op2@test.com', name: 'Op2' })
    cat = await createCategory()
    hub = await createHub()
    item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    await seedInventoryStock(item.id, hub.id, 10)
  })

  it('full transfer -> destination return restores the drawn stock (not 0)', async () => {
    const { rig: rigA } = await createRig(op1.id)

    mockSession = operatorSession(op1.id)
    await addConsumable(rigA.id, item.id, 4, hub.id)
    expect(await stockAtHub(item.id, hub.id)).toBe(6)
    expect(await total(item.id)).toBe(6)

    const srcKi = await openKitItem(rigA.id, item.id)
    const tRes = await transferItems(
      jsonReq(`http://localhost/api/deployments/${rigA.id}/transfer`, 'POST', {
        toOperatorId: op2.id, note: 'take these', items: [{ kitItemId: srcKi.id, quantity: 4 }],
      }),
      { params: Promise.resolve({ id: rigA.id }) },
    )
    expect(tRes.status).toBe(201)
    const transfer = await prisma.transferRequest.findFirstOrThrow({ where: { toOperatorId: op2.id } })

    mockSession = operatorSession(op2.id)
    const aRes = await acceptTransfer(
      jsonReq(`http://localhost/api/transfers/${transfer.id}/accept`, 'POST', {}),
      { params: Promise.resolve({ id: transfer.id }) },
    )
    expect(aRes.status).toBe(200)

    const _da = await prisma.deploymentAssignment.findFirstOrThrow({ where: { operatorId: op2.id, role: 'PRIMARY', endedAt: null } })
    const destRig = await prisma.rig.findUniqueOrThrow({ where: { id: _da.rigId } })
    const destKi = await openKitItem(destRig.id, item.id)
    expect(destKi.quantity).toBe(4)
    expect(destKi.drawnQuantity).toBe(4)
    expect(destKi.drawnHubId).toBe(hub.id)

    await returnToHub(destRig.id, destKi.id, 4, hub.id)
    expect(await stockAtHub(item.id, hub.id)).toBe(10)
    expect(await total(item.id)).toBe(10)
  })

  it('partial transfer -> drawn stock is split and conserved across both operators', async () => {
    const { rig: rigA } = await createRig(op1.id)

    mockSession = operatorSession(op1.id)
    await addConsumable(rigA.id, item.id, 5, hub.id)
    expect(await stockAtHub(item.id, hub.id)).toBe(5)
    expect(await total(item.id)).toBe(5)

    const srcKi = await openKitItem(rigA.id, item.id)
    const tRes = await transferItems(
      jsonReq(`http://localhost/api/deployments/${rigA.id}/transfer`, 'POST', {
        toOperatorId: op2.id, note: 'two of five', items: [{ kitItemId: srcKi.id, quantity: 2 }],
      }),
      { params: Promise.resolve({ id: rigA.id }) },
    )
    expect(tRes.status).toBe(201)
    const transfer = await prisma.transferRequest.findFirstOrThrow({ where: { toOperatorId: op2.id } })

    mockSession = operatorSession(op2.id)
    await acceptTransfer(
      jsonReq(`http://localhost/api/transfers/${transfer.id}/accept`, 'POST', {}),
      { params: Promise.resolve({ id: transfer.id }) },
    )

    const srcAfter = await openKitItem(rigA.id, item.id)
    expect(srcAfter.quantity).toBe(3)
    expect(srcAfter.drawnQuantity).toBe(3)
    const _da = await prisma.deploymentAssignment.findFirstOrThrow({ where: { operatorId: op2.id, role: 'PRIMARY', endedAt: null } })
    const destRig = await prisma.rig.findUniqueOrThrow({ where: { id: _da.rigId } })
    const destKi = await openKitItem(destRig.id, item.id)
    expect(destKi.quantity).toBe(2)
    expect(destKi.drawnQuantity).toBe(2)

    await returnToHub(destRig.id, destKi.id, 2, hub.id)
    mockSession = operatorSession(op1.id)
    await returnToHub(rigA.id, srcAfter.id, 3, hub.id)
    expect(await stockAtHub(item.id, hub.id)).toBe(10)
    expect(await total(item.id)).toBe(10)
  })
})
