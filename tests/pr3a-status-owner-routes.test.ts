// PR-3a (RC-1): every route that changes an asset's status now changes it through the
// status modules, in the same transaction as the record that explains it. One test per
// acceptance line of the fix program (§PR-3a), plus the field-fix matrix. Node DB suite
// (CI-only here; no local Postgres). Alerts are real; email is stubbed.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '../src/lib/prisma'
import { POST as fieldFix } from '../src/app/api/maintenance/field-fix/route'
import { POST as complete } from '../src/app/api/maintenance/[id]/complete/route'
import { PATCH as patchTask, DELETE as deleteTask } from '../src/app/api/maintenance/[id]/route'
import { POST as reportDamage } from '../src/app/api/vehicles/[id]/report-damage/route'
import { POST as reportProblem } from '../src/app/api/inventory/units/[unitId]/report-problem/route'
import { DELETE as removeVehicles } from '../src/app/api/deployments/[id]/vehicles/route'
import { POST as addItems, DELETE as bulkReturn } from '../src/app/api/deployments/[id]/items/route'
import { DELETE as singleReturn } from '../src/app/api/deployments/[id]/items/[kitItemId]/route'
import { POST as endDeployment } from '../src/app/api/deployments/[id]/end/route'
import { POST as declineTransfer } from '../src/app/api/transfers/[id]/decline/route'
import { POST as adminReceive } from '../src/app/api/status-links/[id]/receive/route'
import { createHandoff, getHandoff } from '../src/lib/deployment-handoffs'
import {
  addVehicleToRig, adminSession, createAdminUser, createCategory, createHub, createInventoryItem,
  createInventoryUnit, createOperator, createRig, createVehicle, operatorSession,
} from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/email/resend', () => ({ sendEmail: vi.fn().mockResolvedValue({}) }))

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })

const unitStatus = async (id: string) => (await prisma.inventoryUnit.findUnique({ where: { id } }))?.status
const vehicleStatus = async (id: string) => (await prisma.vehicle.findUnique({ where: { id } }))?.status
const openRepairs = (where: { vehicleId?: string; inventoryUnitId?: string }) =>
  prisma.maintenanceTask.findMany({ where: { ...where, isDamageReport: true, deletedAt: null, status: { not: 'COMPLETED' } } })

let op: { id: string }
let admin: { id: string }
let itemId: string
beforeEach(async () => {
  op = await createOperator()
  admin = await createAdminUser()
  const cat = await createCategory()
  itemId = (await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0, name: 'Corer' })).id
  mockSession = operatorSession(op.id)
})

async function unitInKit(status = 'CHECKED_OUT') {
  const unit = await createInventoryUnit(itemId, { status })
  const { rig, kit } = await createRig(op.id)
  const kitItem = await prisma.kitItem.create({ data: { kitId: kit.id, inventoryItemId: itemId, quantity: 1, inventoryUnitId: unit.id } })
  return { unit, rig, kit, kitItem }
}

describe('field fix closes every open report and returns the asset to service (D-c)', () => {
  it('vehicle: open repair closed, vehicle ACTIVE, audit row written', async () => {
    const v = await createVehicle({ status: 'IN_MAINTENANCE' })
    const t = await prisma.maintenanceTask.create({ data: { taskName: 'Flat', isDamageReport: true, status: 'IN_PROGRESS', vehicleId: v.id } })
    const res = await fieldFix(req('/api/maintenance/field-fix', 'POST', { vehicleId: v.id, notes: 'patched the tyre' }))
    expect(res.status).toBe(201)
    expect((await prisma.maintenanceTask.findUnique({ where: { id: t.id } }))?.status).toBe('COMPLETED')
    expect(await vehicleStatus(v.id)).toBe('ACTIVE')
    expect(await prisma.maintenanceTask.count({ where: { vehicleId: v.id, resolutionPath: 'IN_FIELD' } })).toBe(2)
  })

  it('unit still in a kit → CHECKED_OUT', async () => {
    const { unit } = await unitInKit('IN_MAINTENANCE')
    await prisma.maintenanceTask.create({ data: { taskName: 'Bent', isDamageReport: true, status: 'IN_PROGRESS', inventoryUnitId: unit.id, itemId } })
    await fieldFix(req('/api/maintenance/field-fix', 'POST', { itemId, inventoryUnitId: unit.id, notes: 'straightened' }))
    expect(await unitStatus(unit.id)).toBe('CHECKED_OUT')
    expect(await openRepairs({ inventoryUnitId: unit.id })).toHaveLength(0)
  })

  it('orphan IN_MAINTENANCE unit (no open report, no kit) → AVAILABLE', async () => {
    const unit = await createInventoryUnit(itemId, { status: 'IN_MAINTENANCE' })
    await fieldFix(req('/api/maintenance/field-fix', 'POST', { itemId, inventoryUnitId: unit.id, notes: 'fine now' }))
    expect(await unitStatus(unit.id)).toBe('AVAILABLE')
  })

  it('ACTIVE vehicle with nothing open: no-op apart from the audit row', async () => {
    const v = await createVehicle({ status: 'ACTIVE' })
    await fieldFix(req('/api/maintenance/field-fix', 'POST', { vehicleId: v.id, notes: 'checked' }))
    expect(await vehicleStatus(v.id)).toBe('ACTIVE')
  })

  it('OUT_OF_SERVICE is an admin decision: the report closes, the vehicle stays out', async () => {
    const v = await createVehicle({ status: 'OUT_OF_SERVICE' })
    await prisma.maintenanceTask.create({ data: { taskName: 'Noise', isDamageReport: true, status: 'IN_PROGRESS', vehicleId: v.id } })
    await fieldFix(req('/api/maintenance/field-fix', 'POST', { vehicleId: v.id, notes: 'tightened' }))
    expect(await openRepairs({ vehicleId: v.id })).toHaveLength(0)
    expect(await vehicleStatus(v.id)).toBe('OUT_OF_SERVICE')
  })
})

describe('repairs: complete / delete / reopen move the asset too', () => {
  beforeEach(() => { mockSession = adminSession(admin.id) })

  it('two reports → closing one leaves the vehicle In Maintenance', async () => {
    const v = await createVehicle()
    mockSession = operatorSession(op.id)
    const a = await (await reportDamage(req(`/api/vehicles/${v.id}/report-damage`, 'POST', { notes: 'brakes' }), { params: Promise.resolve({ id: v.id }) })).json()
    // A second report on the same vehicle joins the open repair (one open task per asset).
    await reportDamage(req(`/api/vehicles/${v.id}/report-damage`, 'POST', { notes: 'lights' }), { params: Promise.resolve({ id: v.id }) })
    expect(await openRepairs({ vehicleId: v.id })).toHaveLength(1)
    // A second, independent open report (e.g. created before PR-3a) must hold the vehicle.
    await prisma.maintenanceTask.create({ data: { taskName: 'Legacy', isDamageReport: true, status: 'IN_PROGRESS', vehicleId: v.id } })

    mockSession = adminSession(admin.id)
    await complete(req(`/api/maintenance/${a.data.id}/complete`, 'POST', {}), { params: Promise.resolve({ id: a.data.id }) })
    expect(await vehicleStatus(v.id)).toBe('IN_MAINTENANCE')
  })

  it('DELETE of the only repair releases the vehicle', async () => {
    const v = await createVehicle({ status: 'IN_MAINTENANCE' })
    const t = await prisma.maintenanceTask.create({ data: { taskName: 'Mis-filed', isDamageReport: true, status: 'IN_PROGRESS', vehicleId: v.id } })
    expect((await deleteTask(req(`/api/maintenance/${t.id}`, 'DELETE'), { params: Promise.resolve({ id: t.id }) })).status).toBe(200)
    expect(await vehicleStatus(v.id)).toBe('ACTIVE')
  })

  it('PATCH status COMPLETED closes the repair; Reopen (back to IN_PROGRESS) pulls the vehicle again', async () => {
    const v = await createVehicle({ status: 'IN_MAINTENANCE' })
    const t = await prisma.maintenanceTask.create({ data: { taskName: 'Leak', isDamageReport: true, status: 'IN_PROGRESS', vehicleId: v.id } })
    await patchTask(req(`/api/maintenance/${t.id}`, 'PATCH', { status: 'COMPLETED' }), { params: Promise.resolve({ id: t.id }) })
    expect(await vehicleStatus(v.id)).toBe('ACTIVE')
    await patchTask(req(`/api/maintenance/${t.id}`, 'PATCH', { status: 'IN_PROGRESS' }), { params: Promise.resolve({ id: t.id }) })
    expect(await vehicleStatus(v.id)).toBe('IN_MAINTENANCE')
    expect((await prisma.maintenanceTask.findUnique({ where: { id: t.id } }))?.completedAt).toBeNull()
  })
})

describe('reports never overwrite an admin decision', () => {
  it('report damage on an OUT_OF_SERVICE vehicle: task opened, vehicle stays out of service', async () => {
    const v = await createVehicle({ status: 'OUT_OF_SERVICE' })
    const res = await reportDamage(req(`/api/vehicles/${v.id}/report-damage`, 'POST', { notes: 'scrape' }), { params: Promise.resolve({ id: v.id }) })
    expect(res.status).toBe(201)
    expect(await vehicleStatus(v.id)).toBe('OUT_OF_SERVICE')
    expect(await openRepairs({ vehicleId: v.id })).toHaveLength(1)
  })

  it('"Still usable" unit report → unit stays Checked out, task open', async () => {
    const { unit } = await unitInKit()
    await reportProblem(req(`/api/inventory/units/${unit.id}/report-problem`, 'POST', { notes: 'loose handle', stillUsable: true }), { params: Promise.resolve({ unitId: unit.id }) })
    expect(await unitStatus(unit.id)).toBe('CHECKED_OUT')
    expect(await openRepairs({ inventoryUnitId: unit.id })).toHaveLength(1)
  })
})

describe('remove vehicle from a deployment (S-1)', () => {
  it('report damage → remove as Available → still In Maintenance, repair open', async () => {
    const v = await createVehicle()
    const { rig } = await createRig(op.id)
    await addVehicleToRig(rig.id, v.id)
    await reportDamage(req(`/api/vehicles/${v.id}/report-damage`, 'POST', { notes: 'cracked axle' }), { params: Promise.resolve({ id: v.id }) })

    const res = await removeVehicles(
      req(`/api/deployments/${rig.id}/vehicles`, 'DELETE', { vehicles: [{ vehicleId: v.id, dispositionType: 'AVAILABLE' }] }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(res.status).toBe(200)
    expect(await vehicleStatus(v.id)).toBe('IN_MAINTENANCE')
    expect(await openRepairs({ vehicleId: v.id })).toHaveLength(1)
    expect(await prisma.rigVehicle.count({ where: { rigId: rig.id, vehicleId: v.id, removedAt: null } })).toBe(0)
  })
})

describe('returns follow the one rule (returnUnit)', () => {
  it('bulk-return an out-of-service unit as GOOD → still In Maintenance, the hub is its destination, repair open (D-d)', async () => {
    const hub = await createHub()
    const { unit, rig, kitItem } = await unitInKit('IN_MAINTENANCE')
    const repair = await prisma.maintenanceTask.create({ data: { taskName: 'Broken', isDamageReport: true, status: 'IN_PROGRESS', inventoryUnitId: unit.id, itemId } })

    const res = await bulkReturn(
      req(`/api/deployments/${rig.id}/items`, 'DELETE', { itemDispositions: [{ kitItemId: kitItem.id, type: 'HUB', hubId: hub.id, returnCondition: 'GOOD' }] }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(res.status).toBe(200)
    expect(await unitStatus(unit.id)).toBe('IN_MAINTENANCE')
    const after = await prisma.maintenanceTask.findUnique({ where: { id: repair.id } })
    expect(after?.status).toBe('IN_PROGRESS')
    expect(after?.returnDestinationType).toBe('HUB')
    expect(after?.returnDestinationId).toBe(hub.id)
    // A unit in repair is not on its way to a shelf: no hub-return link for it.
    expect(await prisma.statusLink.count({ where: { inventoryUnitId: unit.id } })).toBe(0)
  })

  it('bulk-return GOOD → Returning with a hub-return link', async () => {
    const hub = await createHub()
    const { unit, rig, kitItem } = await unitInKit()
    await bulkReturn(
      req(`/api/deployments/${rig.id}/items`, 'DELETE', { itemDispositions: [{ kitItemId: kitItem.id, type: 'HUB', hubId: hub.id, returnCondition: 'GOOD' }] }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(await unitStatus(unit.id)).toBe('IN_TRANSIT')
    expect(await prisma.statusLink.count({ where: { type: 'HUB_RETURN', inventoryUnitId: unit.id, state: 'ISSUED' } })).toBe(1)
  })

  it('end deployment with "needs maintenance" → a repair exists; pending handoffs are cancelled (S-10)', async () => {
    const hub = await createHub()
    const { unit, rig, kitItem } = await unitInKit()
    const other = await createOperator({ email: 'h@test.example', name: 'Next Op' })
    const handoffId = await createHandoff({ rigId: rig.id, fromOperatorId: op.id, toOperatorId: other.id, initiatedById: op.id, note: 'shift change' })

    const res = await endDeployment(
      req(`/api/deployments/${rig.id}/end`, 'POST', { itemDispositions: [{ kitItemId: kitItem.id, type: 'HUB', hubId: hub.id, returnCondition: 'IN_MAINTENANCE' }] }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(res.status).toBe(200)
    expect(await unitStatus(unit.id)).toBe('IN_MAINTENANCE')
    expect(await openRepairs({ inventoryUnitId: unit.id })).toHaveLength(1)
    expect((await getHandoff(handoffId))?.status).toBe('CANCELLED')
  })

  it('single return GOOD to a hub → Returning, and (new) its hub-return link is issued', async () => {
    const hub = await createHub()
    const { unit, rig, kitItem } = await unitInKit()
    const res = await singleReturn(
      req(`/api/deployments/${rig.id}/items/${kitItem.id}`, 'DELETE', { returnCondition: 'GOOD', hubId: hub.id }),
      { params: Promise.resolve({ id: rig.id, kitItemId: kitItem.id }) },
    )
    expect(res.status).toBe(200)
    expect(await unitStatus(unit.id)).toBe('IN_TRANSIT')
    expect(await prisma.statusLink.count({ where: { type: 'HUB_RETURN', inventoryUnitId: unit.id } })).toBe(1)
  })
})

describe('Returning units (D-e)', () => {
  it('pick a Returning unit → Checked out, its hub-return link completed', async () => {
    const hub = await createHub()
    const { unit, rig, kitItem } = await unitInKit()
    await bulkReturn(
      req(`/api/deployments/${rig.id}/items`, 'DELETE', { itemDispositions: [{ kitItemId: kitItem.id, type: 'HUB', hubId: hub.id, returnCondition: 'GOOD' }] }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(await unitStatus(unit.id)).toBe('IN_TRANSIT')

    const res = await addItems(
      req(`/api/deployments/${rig.id}/items`, 'POST', { items: [{ itemType: 'SERIALIZED', inventoryItemId: itemId, inventoryUnitId: unit.id }] }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(res.status).toBe(200)
    expect(await unitStatus(unit.id)).toBe('CHECKED_OUT')
    const link = await prisma.statusLink.findFirst({ where: { type: 'HUB_RETURN', inventoryUnitId: unit.id } })
    expect(link?.state).toBe('COMPLETED')
  })

  it('hub receive (admin, on the hub\'s behalf) → AVAILABLE', async () => {
    const hub = await createHub()
    const { unit, rig, kitItem } = await unitInKit()
    await bulkReturn(
      req(`/api/deployments/${rig.id}/items`, 'DELETE', { itemDispositions: [{ kitItemId: kitItem.id, type: 'HUB', hubId: hub.id, returnCondition: 'GOOD' }] }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    const link = await prisma.statusLink.findFirstOrThrow({ where: { type: 'HUB_RETURN', inventoryUnitId: unit.id } })
    mockSession = adminSession(admin.id)
    expect((await adminReceive(req(`/api/status-links/${link.id}/receive`, 'POST'), { params: Promise.resolve({ id: link.id }) })).status).toBe(200)
    expect(await unitStatus(unit.id)).toBe('AVAILABLE')
  })
})

describe('transfer decline keeps the unit\'s state', () => {
  it('declined end-of-deployment transfer of a unit in repair → still In Maintenance', async () => {
    const other = await createOperator({ email: 'to@test.example', name: 'Receiver' })
    const { unit, rig, kitItem } = await unitInKit('IN_MAINTENANCE')
    await endDeployment(
      req(`/api/deployments/${rig.id}/end`, 'POST', { itemDispositions: [{ kitItemId: kitItem.id, type: 'TRANSFER', toOperatorId: other.id }] }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    const transfer = await prisma.transferRequest.findFirstOrThrow({ where: { fromRigId: rig.id } })

    mockSession = operatorSession(other.id)
    const res = await declineTransfer(req(`/api/transfers/${transfer.id}/decline`, 'POST', { responseNote: 'not mine' }), { params: Promise.resolve({ id: transfer.id }) })
    expect(res.status).toBe(200)
    expect(await unitStatus(unit.id)).toBe('IN_MAINTENANCE')
  })
})
