import { describe, it, expect, beforeEach, vi } from 'vitest'
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

vi.mock('../src/lib/alerts', () => ({ createAlert: vi.fn().mockResolvedValue({}), resolveActiveAlert: vi.fn().mockResolvedValue({}) }))

describe('Consumable return: unit scoping', () => {
  it('does not return units from other active rigs', async () => {
    const op1 = await createOperator({ email: 'op1@test.com', name: 'Op1' })
    const op2 = await createOperator({ email: 'op2@test.com', name: 'Op2' })
    const cat = await createCategory()

    // Consumable item with 3 units all checked out
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 3 })
    const unitA = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const unitB = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const unitC = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })

    // Op1 has 2 units, Op2 has 1 unit
    const { rig: rig1, kit: kit1 } = await createRig(op1.id)
    const { rig: rig2, kit: kit2 } = await createRig(op2.id)

    const kitItem1 = await prisma.kitItem.create({
      data: { kitId: kit1.id, inventoryItemId: item.id, quantity: 2, inventoryUnitId: null },
    })
    await prisma.kitItem.create({
      data: { kitId: kit2.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: null },
    })

    // Link unit B to op2's kit item so it gets excluded from op1's return
    await prisma.inventoryUnit.update({ where: { id: unitB.id }, data: {} })
    // Manually associate unitB with a kit item in rig2 by creating another kit item with unitId
    const kit2Item2 = await prisma.kitItem.create({
      data: { kitId: kit2.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unitB.id },
    })
    void kit2Item2

    // Op1 returns 1 unit
    mockSession = operatorSession(op1.id)
    const req = new NextRequest(`http://localhost/api/deployments/${rig1.id}/items/${kitItem1.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ quantity: 1, returnCondition: 'GOOD' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await deleteKitItem(req, { params: Promise.resolve({ id: rig1.id, kitItemId: kitItem1.id }) })
    expect(res.status).toBe(200)

    // unitB (in op2's kit) must remain CHECKED_OUT
    const unitBAfter = await prisma.inventoryUnit.findUnique({ where: { id: unitB.id } })
    expect(unitBAfter?.status).toBe('CHECKED_OUT')

    // Exactly one unit should have been returned (unitA or unitC, not unitB)
    const allUnits = await prisma.inventoryUnit.findMany({ where: { inventoryItemId: item.id } })
    const availableUnits = allUnits.filter((u) => u.status === 'AVAILABLE')
    expect(availableUnits).toHaveLength(1)
    expect(availableUnits[0].id).not.toBe(unitB.id)

    void unitA
    void unitC
  })
})
