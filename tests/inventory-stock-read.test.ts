import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '../src/app/api/inventory/route'
import { prisma } from '../src/lib/prisma'
import { createCategory, createHub, seedInventoryStock, adminSession, createAdminUser } from './helpers/fixtures'

// S1 closure: GET /api/inventory must return stock-table-based availableQuantity
// and derivedQuantity for consumables, not the legacy unitCounts (which are
// always 0 for items with no InventoryUnit rows).

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () =>
    Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))

function getReq(params?: Record<string, string>) {
  const url = new URL('http://localhost/api/inventory')
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url)
}

describe('S1: inventory GET returns stock-based quantities for consumables', () => {
  it('reports stock-summed availableQuantity and derivedQuantity when stock rows exist', async () => {
    const admin = await createAdminUser()
    mockSession = adminSession(admin.id)

    const cat = await createCategory()
    const hub = await createHub()
    const item = await prisma.inventoryItem.create({
      data: { name: `Cardboard Box S1-${Date.now()}`, categoryId: cat.id, itemType: 'CONSUMABLE', quantity: 75, hubId: hub.id },
    })
    await seedInventoryStock(item.id, hub.id, 75)

    const res = await GET(getReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    const found = body.data.find((i: { id: string }) => i.id === item.id)
    expect(found).toBeTruthy()
    // Must read from stock table (75), not unitCounts.available (0)
    expect(found.availableQuantity).toBe(75)
    expect(found.derivedQuantity).toBe(75)
    // hubStock array must be present and populated
    expect(found.hubStock).toHaveLength(1)
    expect(found.hubStock[0].available).toBe(75)
  })

  it('falls back to legacy quantity for consumables with no stock rows', async () => {
    const admin = await createAdminUser()
    mockSession = adminSession(admin.id)

    const cat = await createCategory()
    const item = await prisma.inventoryItem.create({
      data: { name: `Legacy Consumable S1-${Date.now()}`, categoryId: cat.id, itemType: 'CONSUMABLE', quantity: 30 },
    })

    const res = await GET(getReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    const found = body.data.find((i: { id: string }) => i.id === item.id)
    expect(found).toBeTruthy()
    // No stock rows → fall back to legacy item.quantity so item remains visible
    expect(found.availableQuantity).toBe(30)
    expect(found.derivedQuantity).toBe(30)
    expect(found.hubStock).toHaveLength(0)
  })
})
