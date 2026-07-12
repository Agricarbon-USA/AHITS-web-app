import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '../src/lib/prisma'
import { createVehicle, createCategory, createInventoryItem, createInventoryUnit, operatorSession, adminSession, createOperator } from './helpers/fixtures'

// ── CC-10 Field Fix & Vehicle Damage ─────────────────────────────────────────
// Acceptance criteria:
//   1. POST /api/maintenance/field-fix creates COMPLETED task, resolutionPath=IN_FIELD,
//      repairType=IN_FIELD, no status change, no alert.
//   2. POST /api/vehicles/[id]/report-damage creates IN_PROGRESS task, flips
//      vehicle to IN_MAINTENANCE, fires DAMAGE_REPORTED alert.
//   3. POST /api/maintenance/[id]/complete on a vehicle damage task restores
//      vehicle to ACTIVE without requiring a return destination.
//   4. POST /api/maintenance/field-fix with itemId+inventoryUnitId links the unit.
//   5. Unauthenticated calls return 401.

let mockSession: ReturnType<typeof operatorSession> | ReturnType<typeof adminSession> | null = null

vi.mock('../src/lib/auth/session', () => ({
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () =>
    Promise.resolve(mockSession?.role === 'ADMIN' ? mockSession : null),
}))

vi.mock('../src/lib/alerts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/alerts')>()
  return { ...actual }
})

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('CC-10 field fix', () => {
  let operator: { id: string }

  beforeEach(async () => {
    operator = await createOperator()
  })

  describe('POST /api/maintenance/field-fix', () => {
    it('creates a COMPLETED field-fix task for a vehicle', async () => {
      const vehicle = await createVehicle({ status: 'ACTIVE' })
      mockSession = operatorSession(operator.id)

      const { POST } = await import('../src/app/api/maintenance/field-fix/route')
      const res = await POST(makeReq({ vehicleId: vehicle.id, notes: 'Tyre checked and re-inflated' }))

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.status).toBe('COMPLETED')
      expect(body.data.isDamageReport).toBe(true)
      expect(body.data.resolutionPath).toBe('IN_FIELD')
      expect(body.data.repairType).toBe('IN_FIELD')
      expect(body.data.completedAt).not.toBeNull()
      expect(body.data.vehicleId).toBe(vehicle.id)

      // Vehicle status must NOT have changed
      const refreshed = await prisma.vehicle.findFirst({ where: { id: vehicle.id } })
      expect(refreshed?.status).toBe('ACTIVE')

      // No DAMAGE_REPORTED alert
      const alert = await prisma.alert.findFirst({
        where: { type: 'DAMAGE_REPORTED', sourceId: body.data.id },
      })
      expect(alert).toBeNull()
    })

    it('creates a COMPLETED field-fix task for an equipment unit', async () => {
      const cat = await createCategory()
      const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED' })
      const unit = await createInventoryUnit(item.id, { status: 'AVAILABLE' })
      mockSession = operatorSession(operator.id)

      const { POST } = await import('../src/app/api/maintenance/field-fix/route')
      const res = await POST(
        makeReq({ itemId: item.id, inventoryUnitId: unit.id, notes: 'Cable replaced' }),
      )

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.itemId).toBe(item.id)
      expect(body.data.inventoryUnitId).toBe(unit.id)
      expect(body.data.status).toBe('COMPLETED')

      // Unit status must NOT have changed
      const refreshed = await prisma.inventoryUnit.findFirst({ where: { id: unit.id } })
      expect(refreshed?.status).toBe('AVAILABLE')
    })

    it('rejects when neither vehicleId nor itemId is provided', async () => {
      mockSession = operatorSession(operator.id)
      const { POST } = await import('../src/app/api/maintenance/field-fix/route')
      const res = await POST(makeReq({ notes: 'Missing subject' }))
      expect(res.status).toBe(400)
    })

    it('returns 401 when unauthenticated', async () => {
      mockSession = null
      const { POST } = await import('../src/app/api/maintenance/field-fix/route')
      const res = await POST(makeReq({ vehicleId: 'any', notes: 'x' }))
      expect(res.status).toBe(401)
    })
  })
})

describe('CC-10 vehicle damage report', () => {
  let operator: { id: string }

  beforeEach(async () => {
    operator = await createOperator()
  })

  it('creates an IN_PROGRESS task and flips vehicle to IN_MAINTENANCE', async () => {
    const vehicle = await createVehicle({ status: 'ACTIVE' })
    mockSession = operatorSession(operator.id)

    const { POST } = await import('../src/app/api/vehicles/[id]/report-damage/route')
    const req = new NextRequest(`http://localhost/api/vehicles/${vehicle.id}/report-damage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Windshield cracked', repairType: 'AT_SHOP' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: vehicle.id }) })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.status).toBe('IN_PROGRESS')
    expect(body.data.isDamageReport).toBe(true)
    expect(body.data.vehicleId).toBe(vehicle.id)
    expect(body.data.repairType).toBe('AT_SHOP')

    // Vehicle must now be IN_MAINTENANCE
    const refreshed = await prisma.vehicle.findFirst({ where: { id: vehicle.id } })
    expect(refreshed?.status).toBe('IN_MAINTENANCE')

    // DAMAGE_REPORTED alert must exist
    const alert = await prisma.alert.findFirst({
      where: { type: 'DAMAGE_REPORTED', sourceId: body.data.id },
    })
    expect(alert).not.toBeNull()
    expect(alert?.resolved).toBe(false)
  })

  it('returns 404 for a non-existent vehicle', async () => {
    mockSession = operatorSession(operator.id)
    const { POST } = await import('../src/app/api/vehicles/[id]/report-damage/route')
    const req = new NextRequest('http://localhost/api/vehicles/does-not-exist/report-damage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Damage' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'does-not-exist' }) })
    expect(res.status).toBe(404)
  })

  it('returns 401 when unauthenticated', async () => {
    mockSession = null
    const vehicle = await createVehicle()
    const { POST } = await import('../src/app/api/vehicles/[id]/report-damage/route')
    const req = new NextRequest(`http://localhost/api/vehicles/${vehicle.id}/report-damage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Damage' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: vehicle.id }) })
    expect(res.status).toBe(401)
  })
})

describe('CC-10 vehicle damage close (complete route)', () => {
  let admin: { id: string }

  beforeEach(async () => {
    admin = await createOperator()
  })

  it('closes a vehicle damage report, restores vehicle to ACTIVE, no return destination needed', async () => {
    const vehicle = await createVehicle({ status: 'IN_MAINTENANCE' })
    mockSession = adminSession(admin.id)

    // Create the vehicle damage task directly
    const task = await prisma.maintenanceTask.create({
      data: {
        taskName: 'Damage report: test vehicle',
        isDamageReport: true,
        status: 'IN_PROGRESS',
        vehicleId: vehicle.id,
        notes: 'Bumper dented',
      },
    })

    const { POST } = await import('../src/app/api/maintenance/[id]/complete/route')
    const req = new NextRequest(`http://localhost/api/maintenance/${task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Bumper replaced' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: task.id }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.status).toBe('COMPLETED')

    // Vehicle restored to ACTIVE
    const refreshed = await prisma.vehicle.findFirst({ where: { id: vehicle.id } })
    expect(refreshed?.status).toBe('ACTIVE')
  })

  it('still requires a return destination for unit damage reports', async () => {
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id)
    const unit = await createInventoryUnit(item.id, { status: 'IN_MAINTENANCE' })
    mockSession = adminSession(admin.id)

    const task = await prisma.maintenanceTask.create({
      data: {
        taskName: 'Damage repair: test item',
        isDamageReport: true,
        status: 'IN_PROGRESS',
        itemId: item.id,
        inventoryUnitId: unit.id,
        notes: 'Cracked sensor',
      },
    })

    const { POST } = await import('../src/app/api/maintenance/[id]/complete/route')
    const req = new NextRequest(`http://localhost/api/maintenance/${task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req, { params: Promise.resolve({ id: task.id }) })

    // Must reject without a return destination
    expect(res.status).toBe(400)
  })
})
