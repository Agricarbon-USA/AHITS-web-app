import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as createDeployment } from '../src/app/api/deployments/route'
import { POST as addItems } from '../src/app/api/deployments/[id]/items/route'
import { POST as addVehicles } from '../src/app/api/deployments/[id]/vehicles/route'
import { POST as dailyCheck } from '../src/app/api/daily-check/route'
import { prisma } from '../src/lib/prisma'
import {
  createOperator, createCategory, createInventoryItem, createInventoryUnit,
  createRig, createVehicle, addVehicleToRig, operatorSession,
} from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/alerts', () => ({ createAlert: vi.fn().mockResolvedValue({}) }))
vi.mock('../src/lib/email/resend', () => ({ sendEmail: vi.fn().mockResolvedValue({}) }))

function jsonReq(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Wave A — correctness blockers', () => {
  let op1: Awaited<ReturnType<typeof createOperator>>
  let op2: Awaited<ReturnType<typeof createOperator>>
  let cat: Awaited<ReturnType<typeof createCategory>>

  beforeEach(async () => {
    op1 = await createOperator({ email: 'wa-op1@test.example', name: 'WA Op1' })
    op2 = await createOperator({ email: 'wa-op2@test.example', name: 'WA Op2' })
    cat = await createCategory()
    mockSession = null
  })

  describe('C1 — consumable/serialized-by-quantity check-out', () => {
    it('rejects a serialized check-out by quantity when too few units are available (no over-promise)', async () => {
      const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
      const unit = await createInventoryUnit(item.id, { status: 'AVAILABLE' })

      mockSession = operatorSession(op1.id)
      const res = await createDeployment(jsonReq('http://localhost/api/deployments', {
        note: 'launch',
        kitItems: [{ inventoryItemId: item.id, quantity: 2 }], // only 1 available
      }))

      expect(res.status).toBe(409)
      // Transaction rolled back: the single unit must remain AVAILABLE, not over-allocated.
      const after = await prisma.inventoryUnit.findUnique({ where: { id: unit.id } })
      expect(after?.status).toBe('AVAILABLE')
    })

    it('allows a consumable check-out by quantity even with no unit rows (quantity is authoritative)', async () => {
      const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 20 })
      const { rig } = await createRig(op1.id)

      mockSession = operatorSession(op1.id)
      const res = await addItems(
        jsonReq(`http://localhost/api/deployments/${rig.id}/items`, {
          note: 'add bags',
          items: [{ itemType: 'CONSUMABLE', inventoryItemId: item.id, quantity: 5 }],
        }),
        { params: Promise.resolve({ id: rig.id }) },
      )

      expect(res.status).toBe(200)
      const ki = await prisma.kitItem.findFirst({ where: { inventoryItemId: item.id, removedAt: null } })
      expect(ki?.quantity).toBe(5)
    })

    it('checks out exactly the requested number of available serialized units', async () => {
      const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
      const u1 = await createInventoryUnit(item.id, { status: 'AVAILABLE' })
      const u2 = await createInventoryUnit(item.id, { status: 'AVAILABLE' })
      const { rig } = await createRig(op1.id)

      mockSession = operatorSession(op1.id)
      const res = await addItems(
        jsonReq(`http://localhost/api/deployments/${rig.id}/items`, {
          note: 'add two',
          items: [{ itemType: 'CONSUMABLE', inventoryItemId: item.id, quantity: 2 }],
        }),
        { params: Promise.resolve({ id: rig.id }) },
      )

      expect(res.status).toBe(200)
      const units = await prisma.inventoryUnit.findMany({ where: { id: { in: [u1.id, u2.id] } } })
      expect(units.every((u) => u.status === 'CHECKED_OUT')).toBe(true)
    })
  })

  describe('H1 — vehicle cannot be stolen from another active deployment', () => {
    it('rejects adding a vehicle that has an open RigVehicle in a different active rig', async () => {
      const vehicle = await createVehicle({ name: 'Truck-WA-1', assignedOperatorId: op1.id })
      const { rig: rigA } = await createRig(op1.id)
      await addVehicleToRig(rigA.id, vehicle.id)
      const { rig: rigB } = await createRig(op2.id)

      mockSession = operatorSession(op2.id)
      const res = await addVehicles(
        jsonReq(`http://localhost/api/deployments/${rigB.id}/vehicles`, {
          vehicleIds: [vehicle.id],
          note: 'grab it',
        }),
        { params: Promise.resolve({ id: rigB.id }) },
      )

      expect(res.status).toBe(409)
      // Vehicle must NOT have been attached to rig B.
      const inB = await prisma.rigVehicle.findFirst({ where: { rigId: rigB.id, vehicleId: vehicle.id, removedAt: null } })
      expect(inB).toBeNull()
      // And it stays assigned to op1.
      const v = await prisma.vehicle.findUnique({ where: { id: vehicle.id } })
      expect(v?.assignedOperatorId).toBe(op1.id)
    })

    it('allows adding a free vehicle', async () => {
      const vehicle = await createVehicle({ name: 'Truck-WA-2' })
      const { rig } = await createRig(op1.id)

      mockSession = operatorSession(op1.id)
      const res = await addVehicles(
        jsonReq(`http://localhost/api/deployments/${rig.id}/vehicles`, {
          vehicleIds: [vehicle.id],
          note: 'add free truck',
        }),
        { params: Promise.resolve({ id: rig.id }) },
      )

      expect(res.status).toBe(200)
      const rv = await prisma.rigVehicle.findFirst({ where: { rigId: rig.id, vehicleId: vehicle.id, removedAt: null } })
      expect(rv).not.toBeNull()
    })
  })

  describe('H4 — daily check requires the operator to actually operate the vehicle', () => {
    const today = new Date().toISOString().slice(0, 10)
    const checklist = [{ key: 'tires', label: 'Tires', value: 'yes' as const }]

    it('rejects a daily check for a vehicle not in the operator’s active deployment', async () => {
      const someoneElsesVehicle = await createVehicle({ name: 'Truck-WA-3', assignedOperatorId: op2.id })

      mockSession = operatorSession(op1.id)
      const res = await dailyCheck(jsonReq('http://localhost/api/daily-check', {
        vehicleId: someoneElsesVehicle.id,
        date: today,
        checklistJson: checklist,
        passFail: true,
      }))

      expect(res.status).toBe(403)
      const count = await prisma.dailyCheck.count({ where: { vehicleId: someoneElsesVehicle.id } })
      expect(count).toBe(0)
    })

    it('accepts a daily check for a vehicle in the operator’s active deployment', async () => {
      const vehicle = await createVehicle({ name: 'Truck-WA-4' })
      const { rig } = await createRig(op1.id)
      await addVehicleToRig(rig.id, vehicle.id)

      mockSession = operatorSession(op1.id)
      const res = await dailyCheck(jsonReq('http://localhost/api/daily-check', {
        vehicleId: vehicle.id,
        date: today,
        checklistJson: checklist,
        passFail: true,
      }))

      expect(res.status).toBe(201)
      const count = await prisma.dailyCheck.count({ where: { vehicleId: vehicle.id, operatorId: op1.id } })
      expect(count).toBe(1)
    })
  })
})
