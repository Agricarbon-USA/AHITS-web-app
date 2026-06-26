import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as addItems, DELETE as bulkReturn } from '../src/app/api/deployments/[id]/items/route'
import { DELETE as returnKitItem } from '../src/app/api/deployments/[id]/items/[kitItemId]/route'
import { prisma } from '../src/lib/prisma'
import {
  createOperator, createCategory, createInventoryItem, createRig, operatorSession,
  createHub, seedInventoryStock,
} from './helpers/fixtures'

// CR-1: CONSUMABLE stock accounting. MH-1 wires per-hub draws via drawFromHub:
// checkout decrements hub stock + item total (dual-write); a genuine good return
// restores hub stock + item total; daily-usage and damaged returns do not.
// MH-1 changes: sourceHubId required for consumable lines; insufficient hub
// stock is a hard 409 (no silent partial-draw fallback).

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

async function addConsumable(rigId: string, inventoryItemId: string, quantity: number, sourceHubId: string) {
  const req = jsonReq(`http://localhost/api/deployments/${rigId}/items`, 'POST', {
    items: [{ itemType: 'CONSUMABLE', inventoryItemId, quantity }],
    note: 'add',
    photoUrls: [],
    sourceHubId,
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
    const hub = await createHub()
    await seedInventoryStock(item.id, hub.id, 10)
    const { rig } = await createRig(op.id)
    mockSession = operatorSession(op.id)

    const addRes = await addConsumable(rig.id, item.id, 3, hub.id)
    expect(addRes.status).toBe(200)
    expect((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))?.quantity).toBe(7)

    const kitItemId = await openKitItemId(rig.id, item.id)
    expect(kitItemId).toBeTruthy()

    const delRes = await bulkReturn(
      jsonReq(`http://localhost/api/deployments/${rig.id}/items`, 'DELETE', {
        note: 'return',
        itemDispositions: [{ kitItemId, type: 'HUB', quantity: 3, returnCondition: 'GOOD', hubId: hub.id }],
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
    const hub = await createHub()
    await seedInventoryStock(item.id, hub.id, 10)
    const { rig } = await createRig(op.id)
    mockSession = operatorSession(op.id)

    await addConsumable(rig.id, item.id, 4, hub.id)
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
    const hub = await createHub()
    await seedInventoryStock(item.id, hub.id, 10)
    const { rig } = await createRig(op.id)
    mockSession = operatorSession(op.id)

    await addConsumable(rig.id, item.id, 4, hub.id)
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

  it('returns 409 when hub stock is insufficient (hard fail, replaces partial-draw)', async () => {
    const op = await createOperator()
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 2 })
    const hub = await createHub()
    await seedInventoryStock(item.id, hub.id, 2)
    const { rig } = await createRig(op.id)
    mockSession = operatorSession(op.id)

    // Request 5 but only 2 at hub → hard fail
    const res = await addConsumable(rig.id, item.id, 5, hub.id)
    expect(res.status).toBe(409)
    // Stock unchanged
    expect((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))?.quantity).toBe(2)
  })
})
