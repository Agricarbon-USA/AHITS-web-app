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

describe('CheckLog.condition on returns', () => {
  let op: Awaited<ReturnType<typeof createOperator>>
  let cat: Awaited<ReturnType<typeof createCategory>>

  beforeEach(async () => {
    op = await createOperator()
    cat = await createCategory()
    mockSession = operatorSession(op.id)
  })

  it('sets NEEDS_REPAIR on IN_MAINTENANCE return', async () => {
    const item = await createInventoryItem(cat.id, { itemType: ItemType.SERIALIZED, quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id },
    })

    const req = new NextRequest(`http://localhost/api/deployments/${rig.id}/items/${kitItem.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ returnCondition: 'IN_MAINTENANCE' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await deleteKitItem(req, { params: Promise.resolve({ id: rig.id, kitItemId: kitItem.id }) })
    expect(res.status).toBe(200)

    const log = await prisma.checkLog.findFirst({ where: { inventoryUnitId: unit.id, action: 'CHECK_IN' } })
    expect(log?.condition).toBe('NEEDS_REPAIR')
  })

  it('sets MISSING_PARTS on INOPERABLE return', async () => {
    const item = await createInventoryItem(cat.id, { itemType: ItemType.SERIALIZED, quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id },
    })

    const req = new NextRequest(`http://localhost/api/deployments/${rig.id}/items/${kitItem.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ returnCondition: 'INOPERABLE' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await deleteKitItem(req, { params: Promise.resolve({ id: rig.id, kitItemId: kitItem.id }) })
    expect(res.status).toBe(200)

    const log = await prisma.checkLog.findFirst({ where: { inventoryUnitId: unit.id, action: 'CHECK_IN' } })
    expect(log?.condition).toBe('MISSING_PARTS')
  })

  it('sets GOOD on GOOD return', async () => {
    const item = await createInventoryItem(cat.id, { itemType: ItemType.SERIALIZED, quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id },
    })

    const req = new NextRequest(`http://localhost/api/deployments/${rig.id}/items/${kitItem.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ returnCondition: 'GOOD' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await deleteKitItem(req, { params: Promise.resolve({ id: rig.id, kitItemId: kitItem.id }) })
    expect(res.status).toBe(200)

    const log = await prisma.checkLog.findFirst({ where: { inventoryUnitId: unit.id, action: 'CHECK_IN' } })
    expect(log?.condition).toBe('GOOD')
  })
})
