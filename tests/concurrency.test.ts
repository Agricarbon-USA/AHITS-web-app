import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as postDeploymentItems } from '../src/app/api/deployments/[id]/items/route'
import { prisma } from '../src/lib/prisma'
import { createCategory, createOperator, createInventoryItem, createInventoryUnit, createRig } from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
}))

describe('Serialized checkout concurrency', () => {
  it('two simultaneous checkouts for the same unit — first succeeds, second returns 409', async () => {
    const operator = await createOperator()
    mockSession = { userId: operator.id, role: 'OPERATOR', name: operator.name, email: operator.email }

    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id)

    const op2 = await prisma.user.create({ data: { name: 'Op2', email: 'op2@test.com', role: 'OPERATOR' } })
    const { rig: rig1 } = await createRig(operator.id)
    const { rig: rig2 } = await createRig(op2.id)

    const makeReq = (rigId: string) =>
      new NextRequest(`http://localhost/api/deployments/${rigId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          items: [{ itemType: 'SERIALIZED', inventoryItemId: item.id, inventoryUnitId: unit.id }],
          note: 'Concurrent checkout',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

    // Simulate two concurrent requests by switching mock session per call
    const results = await Promise.all([
      postDeploymentItems(makeReq(rig1.id), { params: Promise.resolve({ id: rig1.id }) }),
      postDeploymentItems(makeReq(rig2.id), { params: Promise.resolve({ id: rig2.id }) }),
    ])

    const statuses = results.map((r) => r.status)
    expect(statuses).toContain(200)
    expect(statuses).toContain(409)

    const finalUnit = await prisma.inventoryUnit.findUnique({ where: { id: unit.id } })
    expect(finalUnit?.status).toBe('CHECKED_OUT')

    const checkedOutKitItems = await prisma.kitItem.count({
      where: { inventoryUnitId: unit.id, removedAt: null },
    })
    expect(checkedOutKitItems).toBe(1)
  })
})
