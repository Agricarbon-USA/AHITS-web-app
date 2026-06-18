import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ItemType } from '@prisma/client'
import { NextRequest } from 'next/server'
import { DELETE as deleteKitItem } from '../src/app/api/deployments/[id]/items/[kitItemId]/route'
import { prisma } from '../src/lib/prisma'
import {
  createOperator, createCategory, createInventoryItem,
  createInventoryUnit, createRig, operatorSession,
} from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))

vi.mock('../src/lib/alerts', () => ({ createAlert: vi.fn().mockResolvedValue({}) }))

describe('Consumable return: unit scoping', () => {
  it('does not touch InventoryUnit rows on consumable return (new model)', async () => {
    const op1 = await createOperator({ email: 'op1@test.com', name: 'Op1' })
    const op2 = await createOperator({ email: 'op2@test.com', name: 'Op2' })
    const cat = await createCategory()

    // Consumable item — quantity tracks owned stock; units are irrelevant to the
    // checkout/return flow but may exist (e.g. created before the model change).
    const item = await createInventoryItem(cat.id, { itemType: ItemType.CONSUMABLE, quantity: 3 })
    const unitA = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const unitB = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })

    const { rig: rig1, kit: kit1 } = await createRig(op1.id)
    const { rig: rig2 } = await createRig(op2.id)
    void rig2

    // Consumable kit items have inventoryUnitId: null
    const kitItem1 = await prisma.kitItem.create({
      data: { kitId: kit1.id, inventoryItemId: item.id, quantity: 2, inventoryUnitId: null },
    })

    // Op1 partially returns 1 of the 2 reserved bags (RETURN mode — no stock loss)
    mockSession = operatorSession(op1.id)
    const req = new NextRequest(`http://localhost/api/deployments/${rig1.id}/items/${kitItem1.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ quantity: 1, mode: 'RETURN', returnCondition: 'GOOD' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await deleteKitItem(req, { params: Promise.resolve({ id: rig1.id, kitItemId: kitItem1.id }) })
    expect(res.status).toBe(200)

    // No InventoryUnit rows should have changed — consumables don't touch them.
    const units = await prisma.inventoryUnit.findMany({ where: { inventoryItemId: item.id } })
    expect(units.every((u) => u.status === 'CHECKED_OUT')).toBe(true)

    // Kit item quantity should have decremented (1 of 2 returned).
    const kitItemAfter = await prisma.kitItem.findUnique({ where: { id: kitItem1.id } })
    expect(kitItemAfter?.quantity).toBe(1)
    expect(kitItemAfter?.removedAt).toBeNull()

    // Owned stock unchanged (RETURN, not CONSUME).
    const itemAfter = await prisma.inventoryItem.findUnique({ where: { id: item.id } })
    expect(itemAfter?.quantity).toBe(3)

    void unitA
    void unitB
  })
})
