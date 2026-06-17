import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as postDeployments } from '../src/app/api/deployments/route'
import { POST as postDeploymentItems } from '../src/app/api/deployments/[id]/items/route'
import { prisma } from '../src/lib/prisma'
import {
  createCategory, createAdmin, createOperator,
  createInventoryItem, createInventoryUnit, createRig,
} from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
}))

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/deployments', () => {
  beforeEach(async () => {
    const operator = await createOperator()
    mockSession = { userId: operator.id, role: 'OPERATOR', name: operator.name, email: operator.email }
  })

  it('CONSUMABLE checkout picks available units', async () => {
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 0 })
    await createInventoryUnit(item.id)
    await createInventoryUnit(item.id)

    const req = new NextRequest('http://localhost/api/deployments', {
      method: 'POST',
      body: JSON.stringify({
        note: 'Test deployment',
        kitItems: [{ inventoryItemId: item.id, quantity: 1 }],
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await postDeployments(req)
    expect(res.status).toBe(201)

    const checkedOut = await prisma.inventoryUnit.count({
      where: { inventoryItemId: item.id, status: 'CHECKED_OUT' },
    })
    expect(checkedOut).toBe(1)
  })

  it('SERIALIZED checkout uses the specified unit', async () => {
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id)

    const req = new NextRequest('http://localhost/api/deployments', {
      method: 'POST',
      body: JSON.stringify({
        note: 'Test deployment',
        kitItems: [{ inventoryItemId: item.id, itemType: 'SERIALIZED', inventoryUnitId: unit.id }],
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await postDeployments(req)
    expect(res.status).toBe(201)

    const updated = await prisma.inventoryUnit.findUnique({ where: { id: unit.id } })
    expect(updated?.status).toBe('CHECKED_OUT')
  })

  it('SERIALIZED checkout rejects unavailable unit', async () => {
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })

    const req = new NextRequest('http://localhost/api/deployments', {
      method: 'POST',
      body: JSON.stringify({
        note: 'Test deployment',
        kitItems: [{ inventoryItemId: item.id, itemType: 'SERIALIZED', inventoryUnitId: unit.id }],
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await postDeployments(req)
    expect(res.status).toBe(409)
  })
})

describe('POST /api/deployments/[id]/items', () => {
  beforeEach(async () => {
    const operator = await createOperator()
    mockSession = { userId: operator.id, role: 'OPERATOR', name: operator.name, email: operator.email }
  })

  it('adds SERIALIZED unit to existing deployment', async () => {
    const operator = await prisma.user.findFirst({ where: { role: 'OPERATOR' } })
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id)
    const { rig } = await createRig(operator!.id)

    const req = new NextRequest(`http://localhost/api/deployments/${rig.id}/items`, {
      method: 'POST',
      body: JSON.stringify({
        items: [{ itemType: 'SERIALIZED', inventoryItemId: item.id, inventoryUnitId: unit.id }],
        note: 'Adding unit',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await postDeploymentItems(req, makeParams(rig.id))
    expect(res.status).toBe(200)

    const updated = await prisma.inventoryUnit.findUnique({ where: { id: unit.id } })
    expect(updated?.status).toBe('CHECKED_OUT')
  })

  it('rejects unit already checked out with 409', async () => {
    const operator = await prisma.user.findFirst({ where: { role: 'OPERATOR' } })
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const { rig } = await createRig(operator!.id)

    const req = new NextRequest(`http://localhost/api/deployments/${rig.id}/items`, {
      method: 'POST',
      body: JSON.stringify({
        items: [{ itemType: 'SERIALIZED', inventoryItemId: item.id, inventoryUnitId: unit.id }],
        note: 'Trying to add already-checked-out unit',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await postDeploymentItems(req, makeParams(rig.id))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/checked out by someone else/)
  })
})
