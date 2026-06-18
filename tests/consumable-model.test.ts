import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as addItems } from '../src/app/api/deployments/[id]/items/route'
import { DELETE as removeKitItem } from '../src/app/api/deployments/[id]/items/[kitItemId]/route'
import { GET as getInventory } from '../src/app/api/inventory/route'
import { prisma } from '../src/lib/prisma'
import { reservedConsumableQty } from '../src/lib/consumables'
import {
  createOperator, createCategory, createInventoryItem, createRig, operatorSession,
} from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/alerts', () => ({ createAlert: vi.fn().mockResolvedValue({}) }))

// Model under test (lib/consumables.ts): InventoryItem.quantity is TOTAL OWNED
// and is mutated ONLY on permanent loss (consumption / write-off). Availability
// is derived: available = quantity − Σ(open consumable reservations).

async function checkout(rigId: string, inventoryItemId: string, quantity: number) {
  const req = new NextRequest(`http://localhost/api/deployments/${rigId}/items`, {
    method: 'POST',
    body: JSON.stringify({
      items: [{ itemType: 'CONSUMABLE', inventoryItemId, quantity }],
      note: 'test checkout',
    }),
    headers: { 'Content-Type': 'application/json' },
  })
  return addItems(req, { params: Promise.resolve({ id: rigId }) })
}

async function removeQty(
  rigId: string,
  kitItemId: string,
  quantity: number,
  mode: 'RETURN' | 'CONSUME',
) {
  const req = new NextRequest(`http://localhost/api/deployments/${rigId}/items/${kitItemId}`, {
    method: 'DELETE',
    body: JSON.stringify({ quantity, mode, notes: 'test' }),
    headers: { 'Content-Type': 'application/json' },
  })
  return removeKitItem(req, { params: Promise.resolve({ id: rigId, kitItemId }) })
}

async function availableQuantityOf(itemId: string): Promise<number> {
  const res = await getInventory(new NextRequest('http://localhost/api/inventory?pageSize=100'))
  const body = await res.json()
  const row = body.data.find((i: { id: string }) => i.id === itemId)
  return row.availableQuantity
}

async function openKitItemId(rigId: string, inventoryItemId: string): Promise<string> {
  const ki = await prisma.kitItem.findFirstOrThrow({
    where: { inventoryItemId, removedAt: null, kit: { rigId } },
  })
  return ki.id
}

describe('Consumable stock model (total-owned, derived availability)', () => {
  let op: Awaited<ReturnType<typeof createOperator>>
  let cat: Awaited<ReturnType<typeof createCategory>>

  beforeEach(async () => {
    op = await createOperator()
    cat = await createCategory()
    mockSession = operatorSession(op.id)
  })

  it('checkout reserves without mutating owned quantity; availability is derived', async () => {
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 50 })
    const { rig } = await createRig(op.id)

    const res = await checkout(rig.id, item.id, 10)
    expect(res.status).toBe(200)

    const after = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(after.quantity).toBe(50) // total owned unchanged
    expect(await reservedConsumableQty(prisma, item.id)).toBe(10)
    expect(await availableQuantityOf(item.id)).toBe(40)

    // No phantom InventoryUnit rows are ever created for a consumable.
    expect(await prisma.inventoryUnit.count({ where: { inventoryItemId: item.id } })).toBe(0)
  })

  it('rejects a checkout that exceeds available stock (409)', async () => {
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 5 })
    const { rig } = await createRig(op.id)

    const res = await checkout(rig.id, item.id, 10)
    expect(res.status).toBe(409)
    expect(await prisma.kitItem.count({ where: { inventoryItemId: item.id, removedAt: null } })).toBe(0)
  })

  it('plain RETURN releases the reservation and does not change owned stock', async () => {
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 50 })
    const { rig } = await createRig(op.id)
    await checkout(rig.id, item.id, 10)
    const kitItemId = await openKitItemId(rig.id, item.id)

    const res = await removeQty(rig.id, kitItemId, 4, 'RETURN')
    expect(res.status).toBe(200)

    const after = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(after.quantity).toBe(50) // returned to shelf, owned unchanged
    expect(await reservedConsumableQty(prisma, item.id)).toBe(6)
    expect(await availableQuantityOf(item.id)).toBe(44)
  })

  it('CONSUME (log usage) permanently reduces owned stock', async () => {
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 50 })
    const { rig } = await createRig(op.id)
    await checkout(rig.id, item.id, 10)
    const kitItemId = await openKitItemId(rig.id, item.id)

    const res = await removeQty(rig.id, kitItemId, 3, 'CONSUME')
    expect(res.status).toBe(200)

    const after = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(after.quantity).toBe(47) // 3 consumed in the field — gone for good
    expect(await reservedConsumableQty(prisma, item.id)).toBe(7) // 7 still out in the kit
    expect(await availableQuantityOf(item.id)).toBe(40) // 47 owned − 7 reserved
  })

  it('full lifecycle reconciles: checkout → consume → return', async () => {
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 20 })
    const { rig } = await createRig(op.id)

    await checkout(rig.id, item.id, 8) // owned 20, reserved 8, available 12
    const kitItemId = await openKitItemId(rig.id, item.id)

    await removeQty(rig.id, kitItemId, 5, 'CONSUME') // used 5: owned 15, reserved 3, available 12
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).quantity).toBe(15)
    expect(await availableQuantityOf(item.id)).toBe(12)

    await removeQty(rig.id, kitItemId, 3, 'RETURN') // return remaining 3: owned 15, reserved 0, available 15
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).quantity).toBe(15)
    expect(await reservedConsumableQty(prisma, item.id)).toBe(0)
    expect(await availableQuantityOf(item.id)).toBe(15)
  })
})
