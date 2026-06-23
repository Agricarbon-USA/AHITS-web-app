import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { nextDueFromInterval } from '../src/lib/maintenance'
import { POST as completeTask } from '../src/app/api/maintenance/[id]/complete/route'
import { prisma } from '../src/lib/prisma'
import { createCategory, createInventoryItem, createInventoryUnit, createVehicle, adminSession } from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () =>
    Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/alerts', () => ({ createAlert: vi.fn().mockResolvedValue({}) }))

function completeReq(id: string, body: object = {}) {
  return new NextRequest(`http://localhost/api/maintenance/${id}/complete`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('nextDueFromInterval', () => {
  it('adds days / months and returns null for mileage & non-positive intervals', () => {
    const from = new Date('2026-01-01T00:00:00Z')
    const days = nextDueFromInterval('DAYS', 30, from)!
    expect(Math.round((days.getTime() - from.getTime()) / 86_400_000)).toBe(30)

    const months = nextDueFromInterval('MONTHS', 3, from)!
    expect(months.getTime()).toBeGreaterThan(from.getTime()) // ~3 months out

    expect(nextDueFromInterval('MILEAGE', 5000, from)).toBeNull()
    expect(nextDueFromInterval('PER_DEPLOYMENT', 1, from)).toBeNull()
    expect(nextDueFromInterval('DAYS', 0, from)).toBeNull()
  })
})

describe('maintenance complete (Wave G)', () => {
  it('reschedules a recurring DAYS task instead of terminating it', async () => {
    mockSession = adminSession('admin1')
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED' })
    const task = await prisma.maintenanceTask.create({
      data: { itemId: item.id, taskName: 'Filter change', intervalType: 'DAYS', intervalValue: 30, status: 'OVERDUE', isDamageReport: false },
    })

    const res = await completeTask(completeReq(task.id), { params: Promise.resolve({ id: task.id }) })
    expect(res.status).toBe(200)

    const after = await prisma.maintenanceTask.findUnique({ where: { id: task.id } })
    expect(after?.status).toBe('UPCOMING')
    expect(after?.completedAt).toBeNull()
    expect(after?.lastCompleted).not.toBeNull()
    expect(after?.nextDue).not.toBeNull()
  })

  it('rolls a MILEAGE task forward by the interval', async () => {
    mockSession = adminSession('admin1')
    const veh = await createVehicle()
    const task = await prisma.maintenanceTask.create({
      data: { vehicleId: veh.id, taskName: 'Oil change', intervalType: 'MILEAGE', intervalValue: 5000, nextOdometer: 10000, status: 'OVERDUE', isDamageReport: false },
    })

    const res = await completeTask(completeReq(task.id, { actualOdometer: 12000 }), { params: Promise.resolve({ id: task.id }) })
    expect(res.status).toBe(200)

    const after = await prisma.maintenanceTask.findUnique({ where: { id: task.id } })
    expect(after?.status).toBe('UPCOMING')
    expect(after?.lastOdometer).toBe(12000)
    expect(after?.nextOdometer).toBe(17000)
  })

  it('terminates a damage report and returns the repaired unit to service', async () => {
    mockSession = adminSession('admin1')
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED' })
    const unit = await createInventoryUnit(item.id, { status: 'IN_MAINTENANCE' })
    const hub = await prisma.hub.create({ data: { name: 'Test Hub', city: 'Austin', state: 'TX' } })
    const task = await prisma.maintenanceTask.create({
      data: { itemId: item.id, inventoryUnitId: unit.id, taskName: 'Damage repair', intervalType: 'DAYS', intervalValue: 0, status: 'IN_PROGRESS', isDamageReport: true },
    })

    const res = await completeTask(completeReq(task.id, { actualCost: 250, returnDestinationType: 'HUB', returnDestinationId: hub.id }), { params: Promise.resolve({ id: task.id }) })
    expect(res.status).toBe(200)

    const after = await prisma.maintenanceTask.findUnique({ where: { id: task.id } })
    expect(after?.status).toBe('COMPLETED')
    expect(after?.completedAt).not.toBeNull()

    const unitAfter = await prisma.inventoryUnit.findUnique({ where: { id: unit.id } })
    expect(unitAfter?.status).toBe('AVAILABLE')
  })
})
