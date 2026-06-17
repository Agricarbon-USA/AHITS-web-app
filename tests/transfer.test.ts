import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as postTransfer } from '../src/app/api/deployments/[id]/transfer/route'
import { POST as acceptTransfer } from '../src/app/api/transfers/[id]/accept/route'
import { prisma } from '../src/lib/prisma'
import {
  createAdmin, createOperator, createCategory,
  createInventoryItem, createInventoryUnit, createRig,
} from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
}))

describe('Transfer', () => {
  it('creates transfer request with correct items', async () => {
    const op1 = await createOperator()
    const op2 = await prisma.user.create({ data: { name: 'Op2', email: 'op2@test.com', role: 'OPERATOR' } })
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op1.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id },
    })

    mockSession = { userId: op1.id, role: 'OPERATOR', name: op1.name, email: op1.email }

    const req = new NextRequest(`http://localhost/api/deployments/${rig.id}/transfer`, {
      method: 'POST',
      body: JSON.stringify({
        toOperatorId: op2.id,
        note: 'Test transfer',
        items: [{ kitItemId: kitItem.id }],
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await postTransfer(req, { params: Promise.resolve({ id: rig.id }) })
    expect(res.status).toBe(201)

    const transfer = await prisma.transferRequest.findFirst({
      where: { fromRigId: rig.id, toOperatorId: op2.id },
      include: { items: true },
    })
    expect(transfer).not.toBeNull()
    expect(transfer?.items).toHaveLength(1)
    expect(transfer?.items[0].kitItemId).toBe(kitItem.id)
  })

  it('accept transfer creates new KitItems with inventoryUnitId carried over', async () => {
    const op1 = await createOperator()
    const op2 = await prisma.user.create({ data: { name: 'Op2', email: 'op2@test.com', role: 'OPERATOR' } })
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op1.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id },
    })
    const transfer = await prisma.transferRequest.create({
      data: {
        fromRigId: rig.id,
        toOperatorId: op2.id,
        initiatedById: op1.id,
        note: 'Test',
        status: 'PENDING',
        items: { create: [{ kitItemId: kitItem.id }] },
      },
    })

    mockSession = { userId: op2.id, role: 'OPERATOR', name: op2.name, email: op2.email }
    const req = new NextRequest(`http://localhost/api/transfers/${transfer.id}/accept`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await acceptTransfer(req, { params: Promise.resolve({ id: transfer.id }) })
    expect(res.status).toBe(200)

    const destRig = await prisma.rig.findFirst({ where: { operatorId: op2.id, endedAt: null } })
    expect(destRig).not.toBeNull()

    const newKitItem = await prisma.kitItem.findFirst({
      where: { kit: { rigId: destRig!.id }, inventoryItemId: item.id, removedAt: null },
    })
    expect(newKitItem).not.toBeNull()
    expect(newKitItem?.inventoryUnitId).toBe(unit.id)
  })
})
