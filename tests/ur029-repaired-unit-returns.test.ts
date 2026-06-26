import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as reviewInoperable } from '../src/app/api/inventory/[id]/review-inoperable/route'
import { POST as completeTask } from '../src/app/api/maintenance/[id]/complete/route'
import { prisma } from '../src/lib/prisma'
import {
  createAdminUser, createCategory, createInventoryItem, createInventoryUnit, createHub, adminSession,
} from './helpers/fixtures'

// UR-029 regression: damage-report maintenance tasks were created with itemId only
// (never inventoryUnitId), but the repair-complete route returns a unit to service
// only via task.unit — so every unit sent to repair was stranded IN_MAINTENANCE
// even after "Complete repair." This pins the unit-link at creation AND the
// return-to-service on completion.

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () =>
    Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/alerts', () => ({
  createAlert: vi.fn().mockResolvedValue({}),
  resolveActiveAlert: vi.fn().mockResolvedValue({}),
}))

function jsonReq(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('UR-029: a repaired unit returns to service when the repair is completed', () => {
  it('links inventoryUnitId on the inoperable-review task and returns the unit to AVAILABLE on complete', async () => {
    const admin = await createAdminUser()
    mockSession = adminSession(admin.id)
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 1 })
    const unit = await createInventoryUnit(item.id, { status: 'INOPERABLE', serialNumber: 'UR029-1' })
    const hub = await createHub()

    // Admin reviews the inoperable unit → REPAIR.
    const reviewRes = await reviewInoperable(
      jsonReq(`http://localhost/api/inventory/${item.id}/review-inoperable`, {
        unitId: unit.id, decision: 'REPAIR', repairType: 'AT_SHOP', note: 'fixable',
      }),
      { params: Promise.resolve({ id: item.id }) },
    )
    expect(reviewRes.status).toBe(200)

    // The created task must be linked to THIS unit (the UR-029 fix) and the unit pulled.
    const task = await prisma.maintenanceTask.findFirst({
      where: { inventoryUnitId: unit.id, status: 'IN_PROGRESS' },
    })
    expect(task).toBeTruthy()
    expect((await prisma.inventoryUnit.findUnique({ where: { id: unit.id } }))?.status).toBe('IN_MAINTENANCE')

    // Completing the repair returns the unit to service.
    const completeRes = await completeTask(
      jsonReq(`http://localhost/api/maintenance/${task!.id}/complete`, {
        returnDestinationType: 'HUB', returnDestinationId: hub.id, repairMethod: 'DELIVER',
      }),
      { params: Promise.resolve({ id: task!.id }) },
    )
    expect(completeRes.status).toBe(200)
    expect((await prisma.inventoryUnit.findUnique({ where: { id: unit.id } }))?.status).toBe('AVAILABLE')
  })
})
