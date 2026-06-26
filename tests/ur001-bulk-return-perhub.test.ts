import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as addItems, DELETE as bulkReturn } from '../src/app/api/deployments/[id]/items/route'
import { prisma } from '../src/lib/prisma'
import { getStockAtHub } from '../src/lib/inventory-stock'
import {
  createOperator, createCategory, createInventoryItem, createRig, operatorSession,
  createHub, seedInventoryStock,
} from './helpers/fixtures'

// UR-001 regression: the bulk "Return items" disposition used to restore only the
// cross-hub total (inventory_items.quantity) and NOT the per-hub inventory_stock
// row, so per-hub stock silently drifted down on every bulk return. The existing
// CR-1 test only asserted the total — which is why it never caught this. These
// assertions pin BOTH stores so they can't diverge again.

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () =>
    Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/alerts', () => ({
  createAlert: vi.fn().mockResolvedValue({}),
  resolveActiveAlert: vi.fn().mockResolvedValue({}),
}))

let keyCounter = 0
function jsonReq(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `ur001-key-${++keyCounter}` },
  })
}

describe('UR-001: bulk consumable return restores PER-HUB stock, not just the total', () => {
  it('keeps inventory_stock (per-hub) and inventory_items.quantity (total) consistent after a bulk return', async () => {
    const op = await createOperator()
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    const hub = await createHub()
    await seedInventoryStock(item.id, hub.id, 10)
    const { rig } = await createRig(op.id)
    mockSession = operatorSession(op.id)

    // Check out 3 from the hub → both stores drop to 7 (dual-write on draw).
    const addRes = await addItems(
      jsonReq(`http://localhost/api/deployments/${rig.id}/items`, 'POST', {
        items: [{ itemType: 'CONSUMABLE', inventoryItemId: item.id, quantity: 3 }],
        note: 'add',
        photoUrls: [],
        sourceHubId: hub.id,
      }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(addRes.status).toBe(200)
    expect(await getStockAtHub(item.id, hub.id)).toBe(7)
    expect((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))?.quantity).toBe(7)

    const ki = await prisma.kitItem.findFirst({
      where: { kit: { rigId: rig.id }, inventoryItemId: item.id, removedAt: null },
    })

    // BULK return all 3 in good condition.
    const delRes = await bulkReturn(
      jsonReq(`http://localhost/api/deployments/${rig.id}/items`, 'DELETE', {
        note: 'return',
        itemDispositions: [{ kitItemId: ki!.id, type: 'HUB', quantity: 3, returnCondition: 'GOOD', hubId: hub.id }],
      }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(delRes.status).toBe(200)

    // Both stores restored to 10 and equal. (Pre-fix: total → 10 but per-hub → 7.)
    expect((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))?.quantity).toBe(10)
    expect(await getStockAtHub(item.id, hub.id)).toBe(10)
  })
})
