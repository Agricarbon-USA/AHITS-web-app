import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as addItems, DELETE as bulkReturn } from '../src/app/api/deployments/[id]/items/route'
import { DELETE as returnKitItem } from '../src/app/api/deployments/[id]/items/[kitItemId]/route'
import { prisma } from '../src/lib/prisma'
import {
  createOperator, createCategory, createInventoryItem, createRig, operatorSession,
} from './helpers/fixtures'

// CR-1: CONSUMABLE stock is authoritative as InventoryItem.quantity. Checking
// out a consumable must draw it down, and a genuine good return to the hub must
// restore it — while daily-usage logging (consumed) and damaged returns must
// NOT restore it. Before the fix, check-out never decremented quantity, so
// on-hand never reflected field usage and reorder/LOW_INVENTORY signals were
// unreliable.

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
    // Unique idempotency key per request so the idempotency wrapper never
    // returns a cached response across calls within a test.
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `test-key-${++keyCounter}` },
  })
}

async function addConsumable(rigId: string, inventoryItemId: string, quantity: number) {
  const req = jsonReq(`http://localhost/api/deployments/${rigId}/items`, 'POST', {
    items: [{ itemType: 'CONSUMABLE', inventoryItemId, quantity }],
    note: 'add',
    photoUrls: [],
  })
  return addItems(req, { params: Promise.resolve({ id: rigId }) })
}

async function openKitItemId(rigId: string, inventoryItemId: string) {
  const ki = await prisma.kitItem.findFirst({
    where: { kit: { rigId }, inventoryItemId, removedAt: null },
  })
  return ki?.id
}

describe('CR-1: consumable stock accounting', () => {
  it('decrements on check-out and restores on a good hub return (round-trip)', async () => {
    const op = await createOperator()
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    const { rig } = await createRig(op.id)
    mockSession = operatorSession(op.id)

    const addRes = await addConsumable(rig.id, item.id, 3)
    expect(addRes.status).toBe(200)
    expect((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))?.quantity).toBe(7)

    const kitItemId = await openKitItemId(rig.id, item.id)
    expect(kitItemId).toBeTruthy()

    const delRes = await bulkReturn(
      jsonReq(`http://localhost/api/deployments/${rig.id}/items`, 'DELETE', {
        note: 'return',
        itemDispositions: [{ kitItemId, type: 'HUB', quantity: 3, returnCondition: 'GOOD' }],
      }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(delRes.status).toBe(200)
    expect((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))?.quantity).toBe(10)
  })

  it('does not restore stock for daily-usage logging (consumed:true)', async () => {
    const op = await createOperator()
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    const { rig } = await createRig(op.id)
    mockSession = operatorSession(op.id)

    await addConsumable(rig.id, item.id, 4)
    expect((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))?.quantity).toBe(6)

    const kitItemId = await openKitItemId(rig.id, item.id)
    const res = await returnKitItem(
      jsonReq(`http://localhost/api/deployments/${rig.id}/items/${kitItemId}`, 'DELETE', {
        quantity: 4,
        returnCondition: 'GOOD',
        consumed: true,
      }),
      { params: Promise.resolve({ id: rig.id, kitItemId: kitItemId! }) },
    )
    expect(res.status).toBe(200)
    // Used up in the field — stock stays drawn down, not restored.
    expect((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))?.quantity).toBe(6)
  })

  it('restores a genuine per-item good return (no consumed flag)', async () => {
    const op = await createOperator()
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    const { rig } = await createRig(op.id)
    mockSession = operatorSession(op.id)

    await addConsumable(rig.id, item.id, 4)
    const kitItemId = await openKitItemId(rig.id, item.id)
    const res = await returnKitItem(
      jsonReq(`http://localhost/api/deployments/${rig.id}/items/${kitItemId}`, 'DELETE', {
        quantity: 4,
        returnCondition: 'GOOD',
      }),
      { params: Promise.resolve({ id: rig.id, kitItemId: kitItemId! }) },
    )
    expect(res.status).toBe(200)
    expect((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))?.quantity).toBe(10)
  })

  it('floors at zero on a stale/low count instead of going negative', async () => {
    const op = await createOperator()
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 2 })
    const { rig } = await createRig(op.id)
    mockSession = operatorSession(op.id)

    const res = await addConsumable(rig.id, item.id, 5)
    expect(res.status).toBe(200)
    expect((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))?.quantity).toBe(0)
  })
})
