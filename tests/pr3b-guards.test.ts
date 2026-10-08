// PR-3b (RC-1 · S-7 · D-a · D-f · D-g · L-7): reference guards, item retire, the
// admin-owned states, and the INV-6/8/9 monitors — against a real DB.
// Node DB suite (CI-only here; no local Postgres). Alerts are real; email and the
// alert dispatcher are stubbed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '../src/lib/prisma'
import { openReferences, assertNoOpenReferences, ReferenceConflict } from '../src/lib/asset-references'
import { allHubStockForScan } from '../src/lib/inventory-stock'
import { PATCH as patchItem, DELETE as deleteItem } from '../src/app/api/inventory/[id]/route'
import { PATCH as patchUnit } from '../src/app/api/inventory/units/[unitId]/route'
import { PATCH as patchVehicle, DELETE as deleteVehicle } from '../src/app/api/vehicles/[id]/route'
import { PATCH as patchUser } from '../src/app/api/users/[id]/route'
import { PATCH as patchHub, DELETE as deleteHub } from '../src/app/api/hubs/[id]/route'
import { POST as createDeployment } from '../src/app/api/deployments/route'
import { POST as addOperator } from '../src/app/api/deployments/[id]/operators/route'
import { POST as addVehicles } from '../src/app/api/deployments/[id]/vehicles/route'
import { GET as cronDispatch } from '../src/app/api/cron/dispatch/route'
import { GET as inventoryList } from '../src/app/api/inventory/route'
import {
  addVehicleToRig, adminSession, createAdminUser, createCategory, createHub, createInventoryItem,
  createInventoryUnit, createOperator, createRig, createVehicle, seedInventoryStock,
} from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/email/resend', () => ({ sendEmail: vi.fn().mockResolvedValue({}) }))
vi.mock('../src/lib/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/notifications')>()),
  dispatchPendingAlerts: vi.fn().mockResolvedValue({ alerts: 0, notifications: 0, emailed: false }),
}))

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
const p = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) })
const cronReq = () => new NextRequest('http://localhost/api/cron/dispatch', { headers: { authorization: 'Bearer test-cron-secret' } })

let admin: { id: string }
let op: { id: string; name: string }
let catId: string
beforeEach(async () => {
  process.env.CRON_SECRET = 'test-cron-secret'
  vi.stubEnv('EMAIL_SANDBOX', '1')
  admin = await createAdminUser()
  op = await createOperator({ name: 'Brett Hill', email: 'brett@test.example' })
  catId = (await createCategory()).id
  mockSession = adminSession(admin.id)
})
afterEach(() => { vi.unstubAllEnvs() })

async function unitInKit(itemId: string, status = 'CHECKED_OUT') {
  const unit = await createInventoryUnit(itemId, { status })
  const { rig, kit } = await createRig(op.id)
  await prisma.kitItem.create({ data: { kitId: kit.id, inventoryItemId: itemId, quantity: 1, inventoryUnitId: unit.id } })
  return { unit, rig }
}

// An empty reference set never blocks.
const NO_REFS = { rigVehicles: [], kitItems: [], pendingTransfers: [], openTasks: [], activeLinks: [], heldLines: [], stock: [], primaryRigs: [], unitsOut: [] }

describe('openReferences / assertNoOpenReferences', () => {
  it('vehicle on a live deployment → named, with the operator', async () => {
    const v = await createVehicle({ name: 'Truck-01' })
    const { rig } = await createRig(op.id)
    await addVehicleToRig(rig.id, v.id)
    const refs = await openReferences({ vehicleId: v.id })
    expect(refs.rigVehicles).toEqual([{ rigId: rig.id, operatorName: 'Brett Hill' }])
    expect(() => assertNoOpenReferences('vehicle', 'Truck-01', refs)).toThrow("Truck-01 is on Brett Hill's deployment — end or transfer it first.")
  })

  it('unit in a live kit, and a Returning unit (active hub link)', async () => {
    const item = await createInventoryItem(catId, { itemType: 'SERIALIZED', quantity: 0 })
    const { unit } = await unitInKit(item.id)
    expect((await openReferences({ unitId: unit.id })).kitItems).toHaveLength(1)
    const returning = await createInventoryUnit(item.id, { status: 'IN_TRANSIT' })
    await prisma.statusLink.create({ data: { type: 'HUB_RETURN', tokenHash: `t-${returning.id}`, expiresAt: new Date(Date.now() + 864e5), inventoryUnitId: returning.id, createdById: admin.id } })
    const refs = await openReferences({ unitId: returning.id })
    expect(refs.activeLinks).toHaveLength(1)
    expect(() => assertNoOpenReferences('unit', 'Rover R-2', refs)).toThrow(ReferenceConflict)
  })

  it('item: units out / Returning / in repair count; shelf stock does not', async () => {
    const item = await createInventoryItem(catId, { itemType: 'SERIALIZED', quantity: 0 })
    await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    await createInventoryUnit(item.id, { status: 'IN_TRANSIT' })
    await createInventoryUnit(item.id, { status: 'AVAILABLE' })
    const refs = await openReferences({ itemId: item.id })
    expect(refs.unitsOut).toHaveLength(2)
    expect(() => assertNoOpenReferences('item', 'Rover', refs)).toThrow('2 units are still out or in repair — get them back first.')

    const bags = await createInventoryItem(catId, { name: 'Bags', quantity: 10 })
    const hub = await createHub()
    await seedInventoryStock(bags.id, hub.id, 10)
    const bagRefs = await openReferences({ itemId: bags.id })
    expect(bagRefs.stock).toHaveLength(1)
    expect(() => assertNoOpenReferences('item', 'Bags', bagRefs)).not.toThrow()
  })

  it('hub with stock on hand; user who is PRIMARY on an active deployment (D-f)', async () => {
    const hub = await createHub({ name: 'Home Lab' })
    const bags = await createInventoryItem(catId, { name: 'Bags', quantity: 4 })
    await seedInventoryStock(bags.id, hub.id, 4)
    expect(() => assertNoOpenReferences('hub', 'Home Lab', NO_REFS)).not.toThrow()
    const hubRefs = await openReferences({ hubId: hub.id })
    expect(() => assertNoOpenReferences('hub', 'Home Lab', hubRefs)).toThrow(/Home Lab still holds stock/)

    await createRig(op.id)
    const userRefs = await openReferences({ userId: op.id })
    expect(userRefs.primaryRigs).toHaveLength(1)
    expect(() => assertNoOpenReferences('user', 'Brett Hill', userRefs)).toThrow('Brett Hill is the operator on an active deployment — end or transfer it first.')
  })
})

describe('item retire (D-a)', () => {
  it('refused with the count while a unit is out — nothing written', async () => {
    const item = await createInventoryItem(catId, { itemType: 'SERIALIZED', quantity: 0, name: 'Rover' })
    await unitInKit(item.id)
    const onShelf = await createInventoryUnit(item.id)
    const res = await patchItem(req(`/api/inventory/${item.id}`, 'PATCH', { status: 'RETIRED' }), p({ id: item.id }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('1 unit is still out or in repair — get them back first.')
    expect((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))?.status).not.toBe('RETIRED')
    expect((await prisma.inventoryUnit.findUnique({ where: { id: onShelf.id } }))?.status).toBe('AVAILABLE')
  })

  it('a Returning unit also blocks (IN_TRANSIT is pickable, so it is "out")', async () => {
    const item = await createInventoryItem(catId, { itemType: 'SERIALIZED', quantity: 0 })
    await createInventoryUnit(item.id, { status: 'IN_TRANSIT' })
    expect((await patchItem(req(`/api/inventory/${item.id}`, 'PATCH', { status: 'RETIRED' }), p({ id: item.id }))).status).toBe(409)
  })

  it('retires every unit on hand with its QR released; not deleted', async () => {
    const item = await createInventoryItem(catId, { itemType: 'SERIALIZED', quantity: 0 })
    const a = await createInventoryUnit(item.id)
    const b = await createInventoryUnit(item.id, { status: 'INOPERABLE' })
    const res = await patchItem(req(`/api/inventory/${item.id}`, 'PATCH', { status: 'RETIRED' }), p({ id: item.id }))
    expect(res.status).toBe(200)
    for (const u of [a, b]) {
      const after = await prisma.inventoryUnit.findUnique({ where: { id: u.id } })
      expect(after?.status).toBe('RETIRED')
      expect(after?.qrCodeId.startsWith(`${u.qrCodeId}::retired::`)).toBe(true)
    }
    const after = await prisma.inventoryItem.findUnique({ where: { id: item.id } })
    expect(after?.status).toBe('RETIRED')
    expect(after?.deletedAt).toBeNull()
  })

  it('consumable: stock rows and quantity untouched, LOW_INVENTORY resolved, the scan skips it', async () => {
    const hub = await createHub()
    const bags = await createInventoryItem(catId, { name: 'Bags', quantity: 3 })
    await seedInventoryStock(bags.id, hub.id, 3)
    await prisma.inventoryItem.update({ where: { id: bags.id }, data: { lowStockThreshold: 5 } })
    const key = `LOW_INVENTORY:inventory_items:${bags.id}:${hub.id}`
    await prisma.alert.create({ data: { type: 'LOW_INVENTORY', sourceTable: 'inventory_items', sourceId: `${bags.id}:${hub.id}`, activeKey: key } })

    expect((await patchItem(req(`/api/inventory/${bags.id}`, 'PATCH', { status: 'RETIRED' }), p({ id: bags.id }))).status).toBe(200)
    expect((await prisma.inventoryStock.findFirst({ where: { itemId: bags.id } }))?.quantity).toBe(3)
    expect((await prisma.inventoryItem.findUnique({ where: { id: bags.id } }))?.quantity).toBe(3)
    expect(await prisma.alert.count({ where: { sourceId: `${bags.id}:${hub.id}`, resolved: false } })).toBe(0)
    expect((await allHubStockForScan()).some((r) => r.itemId === bags.id)).toBe(false)
  })

  it('item DELETE is refused while units are out', async () => {
    const item = await createInventoryItem(catId, { itemType: 'SERIALIZED', quantity: 0 })
    await unitInKit(item.id)
    expect((await deleteItem(req(`/api/inventory/${item.id}`, 'DELETE'), p({ id: item.id }))).status).toBe(409)
    expect((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))?.deletedAt).toBeNull()
  })
})

describe('the inventory list and retired items (BF-1, list half)', () => {
  it('default excludes RETIRED (total matches); includeRetired=1 and status=RETIRED include it', async () => {
    await createInventoryItem(catId, { name: 'Live one' })
    await createInventoryItem(catId, { name: 'Gone one', status: 'RETIRED' })
    const list = async (qs: string) => (await (await inventoryList(req(`/api/inventory${qs}`, 'GET'))).json()) as { data: { name: string }[]; total: number }
    const def = await list('')
    expect(def.data.map((r) => r.name)).toEqual(['Live one'])
    expect(def.total).toBe(1)
    expect((await list('?includeRetired=1')).data.map((r) => r.name).sort()).toEqual(['Gone one', 'Live one'])
    expect((await list('?status=RETIRED')).data.map((r) => r.name)).toEqual(['Gone one'])
  })
})

describe('vehicles: delete guard and the admin-owned states (D-g · U-7)', () => {
  it('DELETE on a live deployment → 409 naming it; free → deleted', async () => {
    const v = await createVehicle({ name: 'Truck-01' })
    const { rig } = await createRig(op.id)
    await addVehicleToRig(rig.id, v.id)
    const res = await deleteVehicle(req(`/api/vehicles/${v.id}`, 'DELETE'), p({ id: v.id }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("Truck-01 is on Brett Hill's deployment — end or transfer it first.")
    const free = await createVehicle()
    expect((await deleteVehicle(req(`/api/vehicles/${free.id}`, 'DELETE'), p({ id: free.id }))).status).toBe(200)
  })

  it('PATCH cannot set IN_MAINTENANCE by hand', async () => {
    const v = await createVehicle()
    const res = await patchVehicle(req(`/api/vehicles/${v.id}`, 'PATCH', { status: 'IN_MAINTENANCE' }), p({ id: v.id }))
    expect(res.status).toBe(400)
    expect((await prisma.vehicle.findUnique({ where: { id: v.id } }))?.status).toBe('ACTIVE')
  })

  it('ACTIVE from IN_MAINTENANCE with an open repair → 409 "Close the repair first" naming it', async () => {
    const v = await createVehicle({ status: 'IN_MAINTENANCE' })
    await prisma.maintenanceTask.create({ data: { taskName: 'Damage report: Truck', isDamageReport: true, status: 'IN_PROGRESS', vehicleId: v.id } })
    const res = await patchVehicle(req(`/api/vehicles/${v.id}`, 'PATCH', { status: 'ACTIVE' }), p({ id: v.id }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Close the repair first — "Damage report: Truck" is still open.')
  })

  it('Take out of service / Return to service; an unchanged status on an edit is not checked', async () => {
    const v = await createVehicle()
    expect((await patchVehicle(req(`/api/vehicles/${v.id}`, 'PATCH', { status: 'OUT_OF_SERVICE' }), p({ id: v.id }))).status).toBe(200)
    expect((await prisma.vehicle.findUnique({ where: { id: v.id } }))?.status).toBe('OUT_OF_SERVICE')
    expect((await patchVehicle(req(`/api/vehicles/${v.id}`, 'PATCH', { status: 'ACTIVE' }), p({ id: v.id }))).status).toBe(200)
    const inRepair = await createVehicle({ status: 'IN_MAINTENANCE' })
    const res = await patchVehicle(req(`/api/vehicles/${inRepair.id}`, 'PATCH', { status: 'IN_MAINTENANCE', notes: 'edited' }), p({ id: inRepair.id }))
    expect(res.status).toBe(200)
  })

  it('Return to service with a repair still open lands In Maintenance, not Active', async () => {
    const v = await createVehicle({ status: 'OUT_OF_SERVICE' })
    await prisma.maintenanceTask.create({ data: { taskName: 'Brakes', isDamageReport: true, status: 'IN_PROGRESS', vehicleId: v.id } })
    const res = await patchVehicle(req(`/api/vehicles/${v.id}`, 'PATCH', { status: 'ACTIVE' }), p({ id: v.id }))
    expect(res.status).toBe(200)
    expect((await res.json()).data.status).toBe('IN_MAINTENANCE')
    expect((await prisma.vehicle.findUnique({ where: { id: v.id } }))?.status).toBe('IN_MAINTENANCE')
  })

  it('only Active vehicles go on a deployment — Start Deployment and add-vehicle refuse others, naming them', async () => {
    const inRepair = await createVehicle({ name: 'Truck-03', status: 'IN_MAINTENANCE' })
    const res = await createDeployment(req('/api/deployments', 'POST', { operatorId: op.id, vehicleIds: [inRepair.id] }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Truck-03 is In Maintenance — only Active vehicles can go on a deployment.')
    expect(await prisma.rig.count({ where: { operatorId: op.id } })).toBe(0)

    const { rig } = await createRig(op.id)
    const out = await createVehicle({ name: 'Truck-04', status: 'OUT_OF_SERVICE' })
    const add = await addVehicles(req(`/api/deployments/${rig.id}/vehicles`, 'POST', { vehicleIds: [out.id] }), p({ id: rig.id }))
    expect(add.status).toBe(409)
    expect((await add.json()).error).toBe('Truck-04 is Out of Service — only Active vehicles can go on a deployment.')
    expect(await prisma.rigVehicle.count({ where: { vehicleId: out.id } })).toBe(0)
  })

  it('RETIRED on a live deployment is refused; free → retired, its open repair closed', async () => {
    const onRig = await createVehicle({ name: 'Truck-02' })
    const { rig } = await createRig(op.id)
    await addVehicleToRig(rig.id, onRig.id)
    expect((await patchVehicle(req(`/api/vehicles/${onRig.id}`, 'PATCH', { status: 'RETIRED' }), p({ id: onRig.id }))).status).toBe(409)

    const free = await createVehicle({ status: 'IN_MAINTENANCE' })
    const t = await prisma.maintenanceTask.create({ data: { taskName: 'Seized', isDamageReport: true, status: 'IN_PROGRESS', vehicleId: free.id } })
    expect((await patchVehicle(req(`/api/vehicles/${free.id}`, 'PATCH', { status: 'RETIRED' }), p({ id: free.id }))).status).toBe(200)
    expect((await prisma.vehicle.findUnique({ where: { id: free.id } }))?.status).toBe('RETIRED')
    expect((await prisma.maintenanceTask.findUnique({ where: { id: t.id } }))?.status).toBe('COMPLETED')
  })
})

describe('unit PATCH: only Available / Retired by hand (D-g · S-6)', () => {
  it('a derived state → 400 "Report a problem to put a unit in repair"', async () => {
    const item = await createInventoryItem(catId, { itemType: 'SERIALIZED', quantity: 0 })
    const u = await createInventoryUnit(item.id)
    for (const status of ['IN_MAINTENANCE', 'CHECKED_OUT', 'INOPERABLE', 'IN_TRANSIT']) {
      const res = await patchUnit(req(`/api/inventory/units/${u.id}`, 'PATCH', { status }), p({ unitId: u.id }))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Report a problem to put a unit in repair')
    }
    expect((await prisma.inventoryUnit.findUnique({ where: { id: u.id } }))?.status).toBe('AVAILABLE')
  })

  it('RETIRED goes through retireUnit (QR released) and is refused while the unit is in a kit', async () => {
    const item = await createInventoryItem(catId, { itemType: 'SERIALIZED', quantity: 0 })
    const { unit: inKit } = await unitInKit(item.id)
    expect((await patchUnit(req(`/api/inventory/units/${inKit.id}`, 'PATCH', { status: 'RETIRED' }), p({ unitId: inKit.id }))).status).toBe(409)
    const free = await createInventoryUnit(item.id)
    expect((await patchUnit(req(`/api/inventory/units/${free.id}`, 'PATCH', { status: 'RETIRED' }), p({ unitId: free.id }))).status).toBe(200)
    const after = await prisma.inventoryUnit.findUnique({ where: { id: free.id } })
    expect(after?.status).toBe('RETIRED')
    expect(after?.qrCodeId).toContain('::retired::')
  })

  it('un-retiring restores the released QR code so the physical label scans again', async () => {
    const item = await createInventoryItem(catId, { itemType: 'SERIALIZED', quantity: 0 })
    const u = await createInventoryUnit(item.id)
    await patchUnit(req(`/api/inventory/units/${u.id}`, 'PATCH', { status: 'RETIRED' }), p({ unitId: u.id }))
    expect((await prisma.inventoryUnit.findUnique({ where: { id: u.id } }))?.qrCodeId).not.toBe(u.qrCodeId)
    await patchUnit(req(`/api/inventory/units/${u.id}`, 'PATCH', { status: 'AVAILABLE' }), p({ unitId: u.id }))
    const after = await prisma.inventoryUnit.findUnique({ where: { id: u.id } })
    expect(after?.status).toBe('AVAILABLE')
    expect(after?.qrCodeId).toBe(u.qrCodeId)
  })

  it('AVAILABLE only from RETIRED (un-retire); not from a derived state', async () => {
    const item = await createInventoryItem(catId, { itemType: 'SERIALIZED', quantity: 0 })
    const retired = await createInventoryUnit(item.id, { status: 'RETIRED' })
    expect((await patchUnit(req(`/api/inventory/units/${retired.id}`, 'PATCH', { status: 'AVAILABLE' }), p({ unitId: retired.id }))).status).toBe(200)
    expect((await prisma.inventoryUnit.findUnique({ where: { id: retired.id } }))?.status).toBe('AVAILABLE')
    const { unit: out } = await unitInKit(item.id)
    expect((await patchUnit(req(`/api/inventory/units/${out.id}`, 'PATCH', { status: 'AVAILABLE' }), p({ unitId: out.id }))).status).toBe(409)
  })
})

describe('people and hubs', () => {
  it('deactivating the PRIMARY on an active deployment is refused, naming it (D-f)', async () => {
    const { rig } = await createRig(op.id)
    await prisma.rig.update({ where: { id: rig.id }, data: { label: 'North field run' } })
    const res = await patchUser(req(`/api/users/${op.id}`, 'PATCH', { isActive: false }), p({ id: op.id }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Brett Hill is the operator on "North field run" — end or transfer it first.')
    expect((await prisma.user.findUnique({ where: { id: op.id } }))?.isActive).toBe(true)
  })

  it('Start Deployment and add-operator refuse a deactivated user (409, L-7 server half)', async () => {
    const gone = await createOperator({ name: 'Gone Op', email: 'gone@test.example' })
    await prisma.user.update({ where: { id: gone.id }, data: { isActive: false } })
    const res = await createDeployment(req('/api/deployments', 'POST', { operatorId: gone.id, note: 'x' }))
    expect(res.status).toBe(409)
    expect(await prisma.rig.count({ where: { operatorId: gone.id } })).toBe(0)
    const { rig } = await createRig(op.id)
    expect((await addOperator(req(`/api/deployments/${rig.id}/operators`, 'POST', { operatorId: gone.id }), p({ id: rig.id }))).status).toBe(409)
  })

  it('hub deactivate is refused while it holds stock; reactivation via PATCH works', async () => {
    const hub = await createHub({ name: 'Home Lab' })
    const bags = await createInventoryItem(catId, { name: 'Bags', quantity: 2 })
    await seedInventoryStock(bags.id, hub.id, 2)
    const res = await deleteHub(req(`/api/hubs/${hub.id}`, 'DELETE'), p({ id: hub.id }))
    expect(res.status).toBe(409)
    expect((await prisma.hub.findUnique({ where: { id: hub.id } }))?.isActive).toBe(true)

    // A stock row that holds nothing (0 on hand, 0 reserved) does not block; a reservation does.
    const drained = await createHub({ name: 'Drained Hub' })
    await seedInventoryStock(bags.id, drained.id, 0)
    expect((await deleteHub(req(`/api/hubs/${drained.id}`, 'DELETE'), p({ id: drained.id }))).status).toBe(204)
    const held = await createHub({ name: 'Held Hub' })
    await seedInventoryStock(bags.id, held.id, 0)
    await prisma.inventoryStock.updateMany({ where: { itemId: bags.id, hubId: held.id }, data: { reservedQty: 1 } })
    expect((await deleteHub(req(`/api/hubs/${held.id}`, 'DELETE'), p({ id: held.id }))).status).toBe(409)

    const empty = await createHub({ name: 'Empty Hub' })
    expect((await deleteHub(req(`/api/hubs/${empty.id}`, 'DELETE'), p({ id: empty.id }))).status).toBe(204)
    const back = await patchHub(req(`/api/hubs/${empty.id}`, 'PATCH', { name: 'Empty Hub', city: 'Austin', state: 'TX', isActive: true }), p({ id: empty.id }))
    expect(back.status).toBe(200)
    expect((await prisma.hub.findUnique({ where: { id: empty.id } }))?.isActive).toBe(true)
  })
})

describe('INV-6 / INV-8 / INV-9 (cron) raise and clear', () => {
  const active = (sourceTable: string, sourceId: string) =>
    prisma.alert.count({ where: { type: 'INVENTORY_DRIFT', sourceTable, sourceId, resolved: false } })

  it('INV-6: In Maintenance with no open repair — vehicles and units', async () => {
    const v = await createVehicle({ status: 'IN_MAINTENANCE' })
    const item = await createInventoryItem(catId, { itemType: 'SERIALIZED', quantity: 0 })
    const u = await createInventoryUnit(item.id, { status: 'IN_MAINTENANCE' })
    await cronDispatch(cronReq())
    expect(await active('vehicles', 'inv6-maintenance-without-repair')).toBe(1)
    expect(await active('inventory_units', 'inv6-maintenance-without-repair')).toBe(1)
    await prisma.vehicle.update({ where: { id: v.id }, data: { status: 'ACTIVE' } })
    await prisma.maintenanceTask.create({ data: { taskName: 'Fix', isDamageReport: true, status: 'IN_PROGRESS', inventoryUnitId: u.id, itemId: item.id } })
    await cronDispatch(cronReq())
    expect(await active('vehicles', 'inv6-maintenance-without-repair')).toBe(0)
    expect(await active('inventory_units', 'inv6-maintenance-without-repair')).toBe(0)
  })

  it('INV-8: Available/Returning but still in a live kit', async () => {
    const item = await createInventoryItem(catId, { itemType: 'SERIALIZED', quantity: 0 })
    const { unit } = await unitInKit(item.id, 'AVAILABLE')
    await cronDispatch(cronReq())
    expect(await active('inventory_units', 'inv8-free-but-in-kit')).toBe(1)
    await prisma.inventoryUnit.update({ where: { id: unit.id }, data: { status: 'CHECKED_OUT' } })
    await cronDispatch(cronReq())
    expect(await active('inventory_units', 'inv8-free-but-in-kit')).toBe(0)
  })

  it('INV-9: a deleted or retired asset still on a live deployment', async () => {
    const v = await createVehicle({ status: 'RETIRED' })
    const { rig } = await createRig(op.id)
    await addVehicleToRig(rig.id, v.id)
    await cronDispatch(cronReq())
    expect(await active('vehicles', 'inv9-live-on-retired')).toBe(1)
    await prisma.rigVehicle.updateMany({ where: { vehicleId: v.id }, data: { removedAt: new Date() } })
    await cronDispatch(cronReq())
    expect(await active('vehicles', 'inv9-live-on-retired')).toBe(0)
  })
})
