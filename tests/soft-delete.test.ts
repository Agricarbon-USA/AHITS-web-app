import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '../src/app/api/inventory/route'
import { DELETE } from '../src/app/api/inventory/[id]/route'
import { prisma } from '../src/lib/prisma'
import { createCategory, createAdmin, createInventoryItem, createInventoryUnit, createOperator, createRig } from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
}))

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('Soft Delete', () => {
  beforeEach(async () => {
    const admin = await createAdmin()
    mockSession = { userId: admin.id, role: 'ADMIN', name: admin.name, email: admin.email }
  })

  it('soft-deleted items do not appear in GET /api/inventory', async () => {
    const cat = await createCategory()
    const visible = await createInventoryItem(cat.id, { name: 'Visible Item', quantity: 0 })
    const hidden = await prisma.inventoryItem.create({
      data: { name: 'Hidden Item', categoryId: cat.id, deletedAt: new Date() },
    })

    const req = new NextRequest('http://localhost/api/inventory')
    const res = await GET(req)
    const body = await res.json()
    const ids = body.data.map((i: { id: string }) => i.id)

    expect(ids).toContain(visible.id)
    expect(ids).not.toContain(hidden.id)
  })

  it('DELETE returns 409 when any unit is checked out', async () => {
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { quantity: 0 })
    await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })

    const req = new NextRequest(`http://localhost/api/inventory/${item.id}`, { method: 'DELETE' })
    const res = await DELETE(req, makeParams(item.id))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/checked out/)
  })

  it('DELETE returns 409 when item has a pending transfer', async () => {
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { quantity: 0 })
    const unit = await createInventoryUnit(item.id)
    const operator = await createOperator()
    const operator2 = await prisma.user.create({ data: { name: 'Op2', email: 'op2@test.com', role: 'OPERATOR' } })
    const { rig, kit } = await createRig(operator.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id },
    })
    await prisma.transferRequest.create({
      data: {
        fromRigId: rig.id,
        toOperatorId: operator2.id,
        initiatedById: operator.id,
        note: 'test transfer',
        status: 'PENDING',
        items: { create: [{ kitItemId: kitItem.id }] },
      },
    })

    const req = new NextRequest(`http://localhost/api/inventory/${item.id}`, { method: 'DELETE' })
    const res = await DELETE(req, makeParams(item.id))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/pending transfers/)
  })

  it('units of a soft-deleted item are also soft-deleted', async () => {
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { quantity: 0 })
    const unit1 = await createInventoryUnit(item.id)
    const unit2 = await createInventoryUnit(item.id)

    const req = new NextRequest(`http://localhost/api/inventory/${item.id}`, { method: 'DELETE' })
    await DELETE(req, makeParams(item.id))

    const u1 = await prisma.inventoryUnit.findUnique({ where: { id: unit1.id } })
    const u2 = await prisma.inventoryUnit.findUnique({ where: { id: unit2.id } })
    expect(u1?.deletedAt).not.toBeNull()
    expect(u2?.deletedAt).not.toBeNull()
  })
})
