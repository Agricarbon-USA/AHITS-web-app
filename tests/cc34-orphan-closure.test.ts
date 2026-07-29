// CC-34 (1c): every server branch that changes an asset's status now also creates a
// task and/or raises/resolves the DAMAGE_REPORTED bell — no more silent orphan flips.
// Node DB suite (CI-only here; no local Postgres). Alerts are mocked so we can assert
// the exact (type, sourceTable, sourceId) each branch keys on — the byte-for-byte match
// between createAlert and resolveActiveAlert is what makes the bell clearable.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE as returnItem } from '../src/app/api/deployments/[id]/items/[kitItemId]/route'
import { DELETE as removeVehicles } from '../src/app/api/deployments/[id]/vehicles/route'
import { POST as reviewInoperable } from '../src/app/api/inventory/[id]/review-inoperable/route'
import { DELETE as deleteTask } from '../src/app/api/maintenance/[id]/route'
import { prisma } from '../src/lib/prisma'
import { createAlert, resolveActiveAlert } from '../src/lib/alerts'
import {
  createOperator, createAdminUser, createCategory, createInventoryItem,
  createInventoryUnit, createVehicle, addVehicleToRig, createRig,
  operatorSession, adminSession,
} from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))

vi.mock('../src/lib/alerts', () => ({
  createAlert: vi.fn().mockResolvedValue({}),
  resolveActiveAlert: vi.fn().mockResolvedValue({}),
}))

function jsonReq(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('CC-34 (1c) orphan closure', () => {
  let op: Awaited<ReturnType<typeof createOperator>>
  let cat: Awaited<ReturnType<typeof createCategory>>

  beforeEach(async () => {
    vi.mocked(createAlert).mockClear()
    vi.mocked(resolveActiveAlert).mockClear()
    op = await createOperator()
    cat = await createCategory()
    mockSession = operatorSession(op.id)
  })

  it('scan-return IN_MAINTENANCE creates a damage task (rig + reporter) and rings the bell', async () => {
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id },
    })

    const res = await returnItem(
      jsonReq(`http://localhost/api/deployments/${rig.id}/items/${kitItem.id}`, 'DELETE', { returnCondition: 'IN_MAINTENANCE', notes: 'bent tip' }),
      { params: Promise.resolve({ id: rig.id, kitItemId: kitItem.id }) },
    )
    expect(res.status).toBe(200)

    const task = await prisma.maintenanceTask.findFirst({ where: { inventoryUnitId: unit.id, isDamageReport: true } })
    expect(task).toBeTruthy()
    expect(task?.status).toBe('IN_PROGRESS')
    expect(task?.rigId).toBe(rig.id)
    expect(task?.reportedById).toBe(op.id)
    expect(vi.mocked(createAlert)).toHaveBeenCalledWith(
      'DAMAGE_REPORTED', 'maintenance_tasks', task!.id, expect.anything(), expect.anything(),
    )
  })

  it('scan-return INOPERABLE rings the unit bell without a task (consumable-safe key)', async () => {
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id },
    })

    const res = await returnItem(
      jsonReq(`http://localhost/api/deployments/${rig.id}/items/${kitItem.id}`, 'DELETE', { returnCondition: 'INOPERABLE' }),
      { params: Promise.resolve({ id: rig.id, kitItemId: kitItem.id }) },
    )
    expect(res.status).toBe(200)

    const task = await prisma.maintenanceTask.findFirst({ where: { inventoryUnitId: unit.id } })
    expect(task).toBeNull()
    expect(vi.mocked(createAlert)).toHaveBeenCalledWith(
      'DAMAGE_REPORTED', 'inventory_units', unit.id, expect.anything(), expect.anything(),
    )
  })

  it('vehicle "Send to Maintenance" creates the vehicle damage task + alert', async () => {
    const vehicle = await createVehicle({ status: 'ACTIVE' })
    const { rig } = await createRig(op.id)
    await addVehicleToRig(rig.id, vehicle.id)

    const res = await removeVehicles(
      jsonReq(`http://localhost/api/deployments/${rig.id}/vehicles`, 'DELETE', {
        vehicles: [{ vehicleId: vehicle.id, dispositionType: 'IN_MAINTENANCE', note: 'oil leak' }],
      }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(res.status).toBe(200)

    const task = await prisma.maintenanceTask.findFirst({ where: { vehicleId: vehicle.id, isDamageReport: true } })
    expect(task).toBeTruthy()
    expect(task?.rigId).toBe(rig.id)
    expect(task?.reportedById).toBe(op.id)
    const flipped = await prisma.vehicle.findUnique({ where: { id: vehicle.id } })
    expect(flipped?.status).toBe('IN_MAINTENANCE')
    expect(vi.mocked(createAlert)).toHaveBeenCalledWith(
      'DAMAGE_REPORTED', 'maintenance_tasks', task!.id, expect.anything(), expect.anything(),
    )
  })

  it('review-inoperable RETIRE clears the unit bell on the same key', async () => {
    const admin = await createAdminUser()
    mockSession = adminSession(admin.id)
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'INOPERABLE' })

    const res = await reviewInoperable(
      jsonReq(`http://localhost/api/inventory/${item.id}/review-inoperable`, 'POST', { unitId: unit.id, decision: 'RETIRE', note: 'beyond repair' }),
      { params: Promise.resolve({ id: item.id }) },
    )
    expect(res.status).toBe(200)
    expect(vi.mocked(resolveActiveAlert)).toHaveBeenCalledWith('DAMAGE_REPORTED', 'inventory_units', unit.id)
  })

  it('review-inoperable REPAIR clears the unit bell and opens a repair task', async () => {
    const admin = await createAdminUser()
    mockSession = adminSession(admin.id)
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'INOPERABLE' })

    const res = await reviewInoperable(
      jsonReq(`http://localhost/api/inventory/${item.id}/review-inoperable`, 'POST', { unitId: unit.id, decision: 'REPAIR', note: 'send to shop' }),
      { params: Promise.resolve({ id: item.id }) },
    )
    expect(res.status).toBe(200)
    const task = await prisma.maintenanceTask.findFirst({ where: { inventoryUnitId: unit.id, isDamageReport: true } })
    expect(task).toBeTruthy()
    expect(vi.mocked(resolveActiveAlert)).toHaveBeenCalledWith('DAMAGE_REPORTED', 'inventory_units', unit.id)
  })

  it('deleting a mis-filed task resolves its active alert (no bell ghost)', async () => {
    const admin = await createAdminUser()
    mockSession = adminSession(admin.id)
    const task = await prisma.maintenanceTask.create({
      data: { taskName: 'Mis-filed', isDamageReport: true, status: 'IN_PROGRESS' },
    })
    const activeKey = `DAMAGE_REPORTED:maintenance_tasks:${task.id}`
    await prisma.alert.create({
      data: { type: 'DAMAGE_REPORTED', sourceTable: 'maintenance_tasks', sourceId: task.id, activeKey, resolved: false },
    })

    const res = await deleteTask(
      new NextRequest(`http://localhost/api/maintenance/${task.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: task.id }) },
    )
    expect(res.status).toBe(200)

    const alert = await prisma.alert.findFirst({ where: { sourceId: task.id } })
    expect(alert?.resolved).toBe(true)
    expect(alert?.activeKey).toBeNull()
  })
})
