import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '../src/app/api/inventory/route'
import { GET as getById, PATCH, DELETE } from '../src/app/api/inventory/[id]/route'
import { prisma } from '../src/lib/prisma'
import { createCategory, createAdmin, createOperator, createInventoryItem, createInventoryUnit } from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
}))

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/inventory', () => {
  let categoryId: string

  beforeEach(async () => {
    const admin = await createAdmin()
    mockSession = { userId: admin.id, role: 'ADMIN', name: admin.name, email: admin.email }
    const cat = await createCategory()
    categoryId = cat.id
  })

  it('creates item and units atomically', async () => {
    const req = new NextRequest('http://localhost/api/inventory', {
      method: 'POST',
      body: JSON.stringify({ name: 'GPS Unit', categoryId, itemType: 'SERIALIZED', quantity: 3 }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.data.name).toBe('GPS Unit')
    expect(body.data.units).toHaveLength(3)

    const units = await prisma.inventoryUnit.findMany({
      where: { inventoryItemId: body.data.id },
    })
    expect(units).toHaveLength(3)
    expect(units.every((u) => u.status === 'AVAILABLE')).toBe(true)
  })

  it('returns 403 for non-admin', async () => {
    mockSession = { userId: 'x', role: 'OPERATOR', name: 'Op', email: 'op@test.com' }
    const req = new NextRequest('http://localhost/api/inventory', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', categoryId }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })
})

describe('GET /api/inventory', () => {
  beforeEach(async () => {
    const admin = await createAdmin()
    mockSession = { userId: admin.id, role: 'ADMIN', name: admin.name, email: admin.email }
  })

  it('returns unitCounts and availableUnits with positions', async () => {
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    await createInventoryUnit(item.id)
    await createInventoryUnit(item.id)

    const req = new NextRequest('http://localhost/api/inventory')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    const found = body.data.find((i: { id: string }) => i.id === item.id)
    expect(found).toBeDefined()
    expect(found.unitCounts.available).toBe(2)
    expect(found.availableUnits).toHaveLength(2)
    expect(found.availableUnits[0].position).toBe(1)
    expect(found.availableUnits[1].position).toBe(2)
  })

  it('excludes soft-deleted items', async () => {
    const cat = await createCategory()
    const item = await prisma.inventoryItem.create({
      data: { name: 'Deleted Item', categoryId: cat.id, deletedAt: new Date() },
    })

    const req = new NextRequest('http://localhost/api/inventory')
    const res = await GET(req)
    const body = await res.json()
    expect(body.data.find((i: { id: string }) => i.id === item.id)).toBeUndefined()
  })
})

describe('PATCH /api/inventory/[id]', () => {
  beforeEach(async () => {
    const admin = await createAdmin()
    mockSession = { userId: admin.id, role: 'ADMIN', name: admin.name, email: admin.email }
  })

  it('updates item fields', async () => {
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id)
    const req = new NextRequest(`http://localhost/api/inventory/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated Name' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, makeParams(item.id))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.name).toBe('Updated Name')
  })
})

describe('DELETE /api/inventory/[id]', () => {
  beforeEach(async () => {
    const admin = await createAdmin()
    mockSession = { userId: admin.id, role: 'ADMIN', name: admin.name, email: admin.email }
  })

  it('soft-deletes item and its units', async () => {
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { quantity: 0 })
    const unit = await createInventoryUnit(item.id)

    const req = new NextRequest(`http://localhost/api/inventory/${item.id}`, { method: 'DELETE' })
    const res = await DELETE(req, makeParams(item.id))
    expect(res.status).toBe(200)

    const deletedItem = await prisma.inventoryItem.findUnique({ where: { id: item.id } })
    expect(deletedItem?.deletedAt).not.toBeNull()

    const deletedUnit = await prisma.inventoryUnit.findUnique({ where: { id: unit.id } })
    expect(deletedUnit?.deletedAt).not.toBeNull()
  })

  it('returns 409 when units are checked out', async () => {
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { quantity: 0 })
    await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })

    const req = new NextRequest(`http://localhost/api/inventory/${item.id}`, { method: 'DELETE' })
    const res = await DELETE(req, makeParams(item.id))
    expect(res.status).toBe(409)
  })
})
