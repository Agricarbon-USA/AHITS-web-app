// CC-34 (2a/2c): the one report verb + check→task promotion. Node DB suite (CI-only here).
// Alerts are mocked so we can assert the bell keys; everything else hits the real test DB.
// The two silent-failure traps RIDER C flags are pinned here: photo-422 (a photo-less task
// reported as success) and the vehicle stillUsable default (an omitted toggle must flip).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as reportProblem } from '../src/app/api/inventory/units/[unitId]/report-problem/route'
import { POST as reportDamage } from '../src/app/api/vehicles/[id]/report-damage/route'
import { POST as openTask } from '../src/app/api/daily-check/[id]/open-task/route'
import { prisma } from '../src/lib/prisma'
import { resolveActiveAlert } from '../src/lib/alerts'
import {
  createOperator, createAdminUser, createCategory, createInventoryItem,
  createInventoryUnit, createVehicle, addVehicleToRig, createRig,
  operatorSession, adminSession,
} from './helpers/fixtures'

const PHOTO = '/api/photos/test.jpg'

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

function jsonReq(url: string, body: unknown) {
  return new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
}

describe('CC-34 (2a) one report verb', () => {
  let op: Awaited<ReturnType<typeof createOperator>>
  let cat: Awaited<ReturnType<typeof createCategory>>

  beforeEach(async () => {
    vi.mocked(resolveActiveAlert).mockClear()
    op = await createOperator()
    cat = await createCategory()
    mockSession = operatorSession(op.id)
  })

  it('unit report "Still usable" keeps the unit in the kit and attributes the rig', async () => {
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op.id)
    await prisma.kitItem.create({ data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id } })

    const res = await reportProblem(
      jsonReq(`http://localhost/api/inventory/units/${unit.id}/report-problem`, { notes: 'cracked', photoUrls: [PHOTO], stillUsable: true }),
      { params: Promise.resolve({ unitId: unit.id }) },
    )
    expect(res.status).toBe(201)
    const task = await prisma.maintenanceTask.findFirst({ where: { inventoryUnitId: unit.id } })
    expect(task?.isDamageReport).toBe(true)
    expect(task?.rigId).toBe(rig.id)
    expect(task?.reportedById).toBe(op.id)
    const after = await prisma.inventoryUnit.findUnique({ where: { id: unit.id } })
    expect(after?.status).toBe('CHECKED_OUT') // NOT flipped — annotation, not return
    const photo = await prisma.photo.findFirst({ where: { maintenanceId: task!.id } })
    expect(photo).toBeTruthy()
  })

  it('unit report "Out of service" flips the unit to IN_MAINTENANCE', async () => {
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const res = await reportProblem(
      jsonReq(`http://localhost/api/inventory/units/${unit.id}/report-problem`, { notes: 'broken', photoUrls: [PHOTO], stillUsable: false }),
      { params: Promise.resolve({ unitId: unit.id }) },
    )
    expect(res.status).toBe(201)
    const after = await prisma.inventoryUnit.findUnique({ where: { id: unit.id } })
    expect(after?.status).toBe('IN_MAINTENANCE')
  })

  // UXP-3 (3g) / D36: was "rejected (400, §11.10)". A denied/missing camera must never block
  // a report, so a photo-less unit report is now an honest 201 with a task and zero photo rows.
  it('unit report with no photo is accepted (201, D36) — task created, zero photo rows', async () => {
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const res = await reportProblem(
      jsonReq(`http://localhost/api/inventory/units/${unit.id}/report-problem`, { notes: 'x', photoUrls: [] }),
      { params: Promise.resolve({ unitId: unit.id }) },
    )
    expect(res.status).toBe(201)
    const task = await prisma.maintenanceTask.findFirst({ where: { inventoryUnitId: unit.id } })
    expect(task?.isDamageReport).toBe(true)
    expect(task?.reportedById).toBe(op.id)
    expect(await prisma.photo.count({ where: { maintenanceId: task!.id } })).toBe(0)
  })

  it('unit report carrying an unresolved localphoto ref is 422 (not a silent photo-less success)', async () => {
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const res = await reportProblem(
      jsonReq(`http://localhost/api/inventory/units/${unit.id}/report-problem`, { notes: 'x', photoUrls: ['localphoto:abc'] }),
      { params: Promise.resolve({ unitId: unit.id }) },
    )
    expect(res.status).toBe(422)
    const task = await prisma.maintenanceTask.findFirst({ where: { inventoryUnitId: unit.id } })
    expect(task).toBeNull()
  })

  it('vehicle report with the toggle OMITTED flips the vehicle (route default = flip)', async () => {
    const vehicle = await createVehicle({ status: 'ACTIVE' })
    const res = await reportDamage(
      jsonReq(`http://localhost/api/vehicles/${vehicle.id}/report-damage`, { notes: 'oil leak' }),
      { params: Promise.resolve({ id: vehicle.id }) },
    )
    expect(res.status).toBe(201)
    const after = await prisma.vehicle.findUnique({ where: { id: vehicle.id } })
    expect(after?.status).toBe('IN_MAINTENANCE')
  })

  it('vehicle report "Still usable" does NOT flip the vehicle', async () => {
    const vehicle = await createVehicle({ status: 'ACTIVE' })
    const res = await reportDamage(
      jsonReq(`http://localhost/api/vehicles/${vehicle.id}/report-damage`, { notes: 'small dent', stillUsable: true }),
      { params: Promise.resolve({ id: vehicle.id }) },
    )
    expect(res.status).toBe(201)
    const after = await prisma.vehicle.findUnique({ where: { id: vehicle.id } })
    expect(after?.status).toBe('ACTIVE')
  })
})

describe('CC-34 (2c) check → task promotion', () => {
  it('promotes a failed check to a repair task, carries the words + photo, clears the bell', async () => {
    const op = await createOperator()
    const admin = await createAdminUser()
    const vehicle = await createVehicle({ status: 'ACTIVE' })
    const { rig } = await createRig(op.id)
    await addVehicleToRig(rig.id, vehicle.id)
    const check = await prisma.dailyCheck.create({
      data: {
        vehicleId: vehicle.id,
        operatorId: op.id,
        date: new Date(),
        checklistJson: [{ key: 'brakes', label: 'Brakes', value: 'no', note: 'soft pedal' }],
        passFail: false,
        issues: 'Brakes feel soft',
      },
    })
    const photo = await prisma.photo.create({
      data: { url: PHOTO, context: 'DAILY_CHECK', dailyCheckId: check.id, uploadedById: op.id },
    })

    mockSession = adminSession(admin.id)
    vi.mocked(resolveActiveAlert).mockClear()
    const res = await openTask(
      jsonReq(`http://localhost/api/daily-check/${check.id}/open-task`, { flipVehicle: true }),
      { params: Promise.resolve({ id: check.id }) },
    )
    expect(res.status).toBe(201)
    const { data } = await res.json()

    const task = await prisma.maintenanceTask.findUnique({ where: { id: data.id } })
    expect(task?.isDamageReport).toBe(true)
    expect(task?.vehicleId).toBe(vehicle.id)
    expect(task?.reportedById).toBe(op.id) // the operator, not the admin who clicked
    expect(task?.rigId).toBe(rig.id)
    expect(task?.notes).toContain('Brakes feel soft')
    expect(task?.notes).toContain('soft pedal')

    // Photo relinked to the task WITHOUT losing its check context (one photo, two contexts).
    const relinked = await prisma.photo.findUnique({ where: { id: photo.id } })
    expect(relinked?.maintenanceId).toBe(data.id)
    expect(relinked?.dailyCheckId).toBe(check.id)

    const flipped = await prisma.vehicle.findUnique({ where: { id: vehicle.id } })
    expect(flipped?.status).toBe('IN_MAINTENANCE')
    expect(vi.mocked(resolveActiveAlert)).toHaveBeenCalledWith('DAILY_CHECK_FAILED', 'vehicles', vehicle.id)
  })

  it('refuses to promote a passing check (409)', async () => {
    const op = await createOperator()
    const admin = await createAdminUser()
    const vehicle = await createVehicle({ status: 'ACTIVE' })
    const check = await prisma.dailyCheck.create({
      data: { vehicleId: vehicle.id, operatorId: op.id, date: new Date(), checklistJson: [], passFail: true },
    })
    mockSession = adminSession(admin.id)
    const res = await openTask(
      jsonReq(`http://localhost/api/daily-check/${check.id}/open-task`, {}),
      { params: Promise.resolve({ id: check.id }) },
    )
    expect(res.status).toBe(409)
  })
})
