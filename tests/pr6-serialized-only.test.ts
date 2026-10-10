// PR-6 (D49 · D-v/D-w/D-x/D-y/D-z/D-g′): Repair and Retire are for serialized gear.
// One test per §4 line of AHITS_ADDENDUM_PR-6_SERIALIZED-ONLY-REPAIR-RETIRE_2026-10-10.md.
// Node DB suite (CI-only here; no local Postgres). Alerts are real; email is stubbed.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '../src/lib/prisma'
import { PATCH as patchItem } from '../src/app/api/inventory/[id]/route'
import { POST as addUnits } from '../src/app/api/inventory/[id]/units/route'
import { POST as reviewInoperable } from '../src/app/api/inventory/[id]/review-inoperable/route'
import { POST as createTask } from '../src/app/api/maintenance/route'
import { POST as fieldFix } from '../src/app/api/maintenance/field-fix/route'
import { POST as reportProblem } from '../src/app/api/inventory/units/[unitId]/report-problem/route'
import { DELETE as bulkReturn } from '../src/app/api/deployments/[id]/items/route'
import { DELETE as singleReturn } from '../src/app/api/deployments/[id]/items/[kitItemId]/route'
import { POST as endDeployment } from '../src/app/api/deployments/[id]/end/route'
import { openDamageTask } from '../src/lib/maintenance'
import { ReferenceConflict } from '../src/lib/asset-references'
import { consumableMessage, TYPE_LOCKED_MESSAGE } from '../src/lib/item-rules'
import {
  adminSession, createAdminUser, createCategory, createHub, createInventoryItem,
  createInventoryUnit, createOperator, createRig, operatorSession, seedInventoryStock,
} from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/email/resend', () => ({ sendEmail: vi.fn().mockResolvedValue({}) }))
// The 409-shape assertions on end / bulk / single: those routes' write-off never refuses
// by design, so a ReferenceConflict is forced from inside the transaction to prove the
// catch maps it to 409 (terminal for the offline queue), not a 500.
const { forceConflict } = vi.hoisted(() => ({ forceConflict: { on: false } }))
vi.mock('../src/lib/item-rules', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/item-rules')>()
  return {
    ...real,
    recordWriteOff: async (...args: Parameters<typeof real.recordWriteOff>) => {
      if (forceConflict.on) throw new ReferenceConflict('forced conflict')
      return real.recordWriteOff(...args)
    },
  }
})

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
const p = <T extends object>(v: T) => ({ params: Promise.resolve(v) })
const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error
const unitStatus = async (id: string) => (await prisma.inventoryUnit.findUnique({ where: { id } }))?.status
const tasksOn = (where: { itemId?: string; inventoryUnitId?: string }) =>
  prisma.maintenanceTask.count({ where: { ...where, deletedAt: null } })
const stockAt = async (itemId: string, hubId: string) =>
  (await prisma.inventoryStock.findFirst({ where: { itemId, hubId } }))?.quantity
const PHOTO = '/api/photos/damage.jpg'

let op: { id: string }
let admin: { id: string }
let catId: string
beforeEach(async () => {
  forceConflict.on = false
  op = await createOperator()
  admin = await createAdminUser()
  catId = (await createCategory()).id
  mockSession = adminSession(admin.id)
})

const serialized = (name = 'GPS rover') => createInventoryItem(catId, { itemType: 'SERIALIZED', quantity: 0, name })
const consumable = (name = 'Sample bags', quantity = 10) => createInventoryItem(catId, { itemType: 'CONSUMABLE', quantity, name })

/** A consumable line drawn from a hub: 5 out of 10, the hub left with 5. */
async function consumableOnRig() {
  const hub = await createHub()
  const item = await consumable()
  await seedInventoryStock(item.id, hub.id, 5)
  const { rig, kit } = await createRig(op.id)
  const kitItem = await prisma.kitItem.create({
    data: { kitId: kit.id, inventoryItemId: item.id, quantity: 5, drawnQuantity: 5, drawnHubId: hub.id },
  })
  return { hub, item, rig, kitItem }
}

/** A serialized unit out on a rig. */
async function unitOnRig() {
  const hub = await createHub()
  const item = await serialized()
  const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
  const { rig, kit } = await createRig(op.id)
  const kitItem = await prisma.kitItem.create({ data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id } })
  return { hub, item, unit, rig, kitItem }
}

describe('Retire (D-w) — PATCH /api/inventory/[id]', () => {
  it('a consumable is refused with the D-w text and nothing changes', async () => {
    const hub = await createHub()
    const bags = await consumable()
    await seedInventoryStock(bags.id, hub.id, 10)
    const res = await patchItem(req(`/api/inventory/${bags.id}`, 'PATCH', { status: 'RETIRED' }), p({ id: bags.id }))
    expect(res.status).toBe(409)
    expect(await errorOf(res)).toBe('"Sample bags" is a consumable — consumables are used up or deleted, not retired.')
    expect((await prisma.inventoryItem.findUnique({ where: { id: bags.id } }))?.status).toBe('AVAILABLE')
    expect(await stockAt(bags.id, hub.id)).toBe(10)
  })

  it('a serialized item retires as before: units retired, labels released', async () => {
    const item = await serialized()
    const u = await createInventoryUnit(item.id)
    const res = await patchItem(req(`/api/inventory/${item.id}`, 'PATCH', { status: 'RETIRED' }), p({ id: item.id }))
    expect(res.status).toBe(200)
    const after = await prisma.inventoryUnit.findUnique({ where: { id: u.id } })
    expect(after?.status).toBe('RETIRED')
    expect(after?.qrCodeId).toContain('::retired::')
  })

  it('only Available and Retired can be set on an item (400)', async () => {
    for (const item of [await serialized('A'), await consumable('B')]) {
      const res = await patchItem(req(`/api/inventory/${item.id}`, 'PATCH', { status: 'CHECKED_OUT' }), p({ id: item.id }))
      expect(res.status).toBe(400)
      expect(await errorOf(res)).toBe('Only Available and Retired can be set on an item.')
    }
  })
})

describe('Type lock (D-y)', () => {
  const retype = (id: string, itemType: string) => patchItem(req(`/api/inventory/${id}`, 'PATCH', { itemType }), p({ id }))

  it('refused once the item has a unit, a stock row or a kit line', async () => {
    const withUnit = await serialized('With unit')
    await createInventoryUnit(withUnit.id)
    const withStock = await consumable('With stock')
    await seedInventoryStock(withStock.id, (await createHub()).id, 3)
    const withLine = await consumable('With line')
    const { kit } = await createRig(op.id)
    await prisma.kitItem.create({ data: { kitId: kit.id, inventoryItemId: withLine.id, quantity: 1 } })

    for (const [item, to] of [[withUnit, 'CONSUMABLE'], [withStock, 'SERIALIZED'], [withLine, 'SERIALIZED']] as const) {
      const res = await retype(item.id, to)
      expect(res.status).toBe(409)
      expect(await errorOf(res)).toBe(TYPE_LOCKED_MESSAGE)
      expect((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))?.itemType).toBe(item.itemType)
    }
  })

  it('allowed on a bare item; re-sending the same type is a no-op', async () => {
    const bare = await consumable('Bare', 0)
    expect((await retype(bare.id, 'SERIALIZED')).status).toBe(200)
    expect((await prisma.inventoryItem.findUnique({ where: { id: bare.id } }))?.itemType).toBe('SERIALIZED')

    const stocked = await consumable('Stocked')
    await seedInventoryStock(stocked.id, (await createHub()).id, 3)
    const same = await patchItem(req(`/api/inventory/${stocked.id}`, 'PATCH', { itemType: 'CONSUMABLE', notes: 'edited' }), p({ id: stocked.id }))
    expect(same.status).toBe(200)
  })
})

describe('Units (D-y) — POST /api/inventory/[id]/units', () => {
  it('a consumable is refused (409, not 500); a serialized item gets its unit', async () => {
    const bags = await consumable()
    const refused = await addUnits(req(`/api/inventory/${bags.id}/units`, 'POST', { count: 1 }), p({ id: bags.id }))
    expect(refused.status).toBe(409)
    expect(await errorOf(refused)).toBe(consumableMessage('Sample bags', 'units'))
    expect(await prisma.inventoryUnit.count({ where: { inventoryItemId: bags.id } })).toBe(0)

    const gps = await serialized()
    expect((await addUnits(req(`/api/inventory/${gps.id}/units`, 'POST', { count: 2 }), p({ id: gps.id }))).status).toBe(201)
    expect(await prisma.inventoryUnit.count({ where: { inventoryItemId: gps.id } })).toBe(2)
  })
})

describe('Repair and service (D-v)', () => {
  const schedule = (itemId: string) =>
    createTask(req('/api/maintenance', 'POST', { itemId, taskName: 'Calibrate', intervalType: 'DAYS', intervalValue: 30 }))

  it('POST /api/maintenance: a consumable is refused (409); a serialized item is created (201)', async () => {
    const bags = await consumable()
    const res = await schedule(bags.id)
    expect(res.status).toBe(409)
    expect(await errorOf(res)).toBe('"Sample bags" is a consumable — repairs and service are for serialized gear.')
    expect(await tasksOn({ itemId: bags.id })).toBe(0)
    expect((await schedule((await serialized()).id)).status).toBe(201)
  })

  it('field-fix: a consumable with no unit is refused (409); with a unit it stays unit-keyed (D-z)', async () => {
    const bags = await consumable()
    const res = await fieldFix(req('/api/maintenance/field-fix', 'POST', { itemId: bags.id, notes: 'patched' }))
    expect(res.status).toBe(409)
    expect(await errorOf(res)).toBe(consumableMessage('Sample bags', 'repair'))

    const legacy = await createInventoryUnit(bags.id, { status: 'IN_MAINTENANCE' })
    const withUnit = await fieldFix(req('/api/maintenance/field-fix', 'POST', { itemId: bags.id, inventoryUnitId: legacy.id, notes: 'patched' }))
    expect(withUnit.status).toBe(201)
    expect(await unitStatus(legacy.id)).toBe('AVAILABLE')
  })

  it('openDamageTask({ kind: "item" }) throws on a consumable and still creates on a serialized item', async () => {
    const fields = { taskName: 'Damage', notes: null, reportedById: null, source: 'ADMIN_REVIEW' as const, pull: true }
    const bags = await consumable()
    await expect(prisma.$transaction((t) => openDamageTask(t, { kind: 'item', itemId: bags.id }, fields))).rejects.toBeInstanceOf(ReferenceConflict)
    expect(await tasksOn({ itemId: bags.id })).toBe(0)

    const gps = await serialized()
    const { created } = await prisma.$transaction((t) => openDamageTask(t, { kind: 'item', itemId: gps.id }, fields))
    expect(created).toBe(true)
  })
})

describe('Write-off (D-x) — a damaged consumable on return', () => {
  const writeOffDisp = (kitItemId: string) =>
    ({ kitItemId, type: 'INOPERABLE', canBeFixed: true, repairType: 'AT_SHOP', inoperableNotes: 'soaked', photoUrls: [PHOTO] })

  async function expectWrittenOff(item: { id: string }, hubId: string, rigId: string, note: string) {
    expect(await tasksOn({ itemId: item.id })).toBe(0)
    expect(await prisma.alert.count({ where: { type: 'DAMAGE_REPORTED' } })).toBe(0)
    expect(await stockAt(item.id, hubId)).toBe(5) // not restored
    const log = await prisma.checkLog.findFirst({ where: { itemId: item.id, rigId, action: 'CHECK_IN' } })
    expect(log?.condition).toBe('MISSING_PARTS')
    expect(log?.notes).toBe(note)
  }

  it('end: INOPERABLE with canBeFixed: true (an already-queued payload) → written off, photo on the item', async () => {
    mockSession = operatorSession(op.id)
    const { hub, item, rig, kitItem } = await consumableOnRig()
    const res = await endDeployment(req(`/api/deployments/${rig.id}/end`, 'POST', { note: 'rig note', itemDispositions: [writeOffDisp(kitItem.id)] }), p({ id: rig.id }))
    expect(res.status).toBe(200)
    await expectWrittenOff(item, hub.id, rig.id, 'Written off — soaked')
    expect(await prisma.photo.count({ where: { inventoryItemId: item.id, context: 'DAMAGE' } })).toBe(1)
    expect((await prisma.kitItem.findUnique({ where: { id: kitItem.id } }))?.removedAt).not.toBeNull()
  })

  it('bulk: the same payload → written off; the rig-level note is used when there is no line note', async () => {
    mockSession = operatorSession(op.id)
    const { hub, item, rig, kitItem } = await consumableOnRig()
    const { inoperableNotes, ...noLineNote } = writeOffDisp(kitItem.id)
    void inoperableNotes
    const res = await bulkReturn(req(`/api/deployments/${rig.id}/items`, 'DELETE', { note: 'fell in the creek', itemDispositions: [noLineNote] }), p({ id: rig.id }))
    expect(res.status).toBe(200)
    await expectWrittenOff(item, hub.id, rig.id, 'Written off — fell in the creek')
    expect(await prisma.photo.count({ where: { inventoryItemId: item.id, context: 'DAMAGE' } })).toBe(1)
  })

  it('end and bulk: a HUB return marked IN_MAINTENANCE on a consumable is the same write-off', async () => {
    mockSession = operatorSession(op.id)
    const a = await consumableOnRig()
    await endDeployment(req(`/api/deployments/${a.rig.id}/end`, 'POST', { itemDispositions: [{ kitItemId: a.kitItem.id, type: 'HUB', hubId: a.hub.id, returnCondition: 'IN_MAINTENANCE' }] }), p({ id: a.rig.id }))
    await expectWrittenOff(a.item, a.hub.id, a.rig.id, 'Written off')
    const b = await consumableOnRig()
    await bulkReturn(req(`/api/deployments/${b.rig.id}/items`, 'DELETE', { itemDispositions: [{ kitItemId: b.kitItem.id, type: 'HUB', hubId: b.hub.id, returnCondition: 'INOPERABLE' }] }), p({ id: b.rig.id }))
    await expectWrittenOff(b.item, b.hub.id, b.rig.id, 'Written off')
  })

  it('single: returnCondition INOPERABLE → the same record; GOOD still restores on all three routes', async () => {
    mockSession = operatorSession(op.id)
    const a = await consumableOnRig()
    const res = await singleReturn(req(`/api/deployments/${a.rig.id}/items/${a.kitItem.id}`, 'DELETE', { returnCondition: 'INOPERABLE' }), p({ id: a.rig.id, kitItemId: a.kitItem.id }))
    expect(res.status).toBe(200)
    await expectWrittenOff(a.item, a.hub.id, a.rig.id, 'Written off')

    const b = await consumableOnRig()
    await singleReturn(req(`/api/deployments/${b.rig.id}/items/${b.kitItem.id}`, 'DELETE', { returnCondition: 'GOOD', hubId: b.hub.id }), p({ id: b.rig.id, kitItemId: b.kitItem.id }))
    expect(await stockAt(b.item.id, b.hub.id)).toBe(10)
    const c = await consumableOnRig()
    await bulkReturn(req(`/api/deployments/${c.rig.id}/items`, 'DELETE', { itemDispositions: [{ kitItemId: c.kitItem.id, type: 'HUB', hubId: c.hub.id, returnCondition: 'GOOD' }] }), p({ id: c.rig.id }))
    expect(await stockAt(c.item.id, c.hub.id)).toBe(10)
    const d = await consumableOnRig()
    await endDeployment(req(`/api/deployments/${d.rig.id}/end`, 'POST', { itemDispositions: [{ kitItemId: d.kitItem.id, type: 'HUB', hubId: d.hub.id, returnCondition: 'GOOD' }] }), p({ id: d.rig.id }))
    expect(await stockAt(d.item.id, d.hub.id)).toBe(10)
  })

  it('a serialized line with the same payload still opens and pulls a unit task (unchanged)', async () => {
    mockSession = operatorSession(op.id)
    const { unit, rig, kitItem } = await unitOnRig()
    await endDeployment(req(`/api/deployments/${rig.id}/end`, 'POST', { itemDispositions: [writeOffDisp(kitItem.id)] }), p({ id: rig.id }))
    expect(await unitStatus(unit.id)).toBe('IN_MAINTENANCE')
    expect(await tasksOn({ inventoryUnitId: unit.id })).toBe(1)
  })
})

describe('Legacy units on a consumable (D-z)', () => {
  it('a unit-keyed line written off on end → the unit comes home AVAILABLE with no task', async () => {
    mockSession = operatorSession(op.id)
    const bags = await consumable()
    const legacy = await createInventoryUnit(bags.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op.id)
    const line = await prisma.kitItem.create({ data: { kitId: kit.id, inventoryItemId: bags.id, quantity: 1, inventoryUnitId: legacy.id } })
    const res = await endDeployment(req(`/api/deployments/${rig.id}/end`, 'POST', { itemDispositions: [{ kitItemId: line.id, type: 'INOPERABLE', canBeFixed: true, photoUrls: [] }] }), p({ id: rig.id }))
    expect(res.status).toBe(200)
    expect(await unitStatus(legacy.id)).toBe('AVAILABLE')
    expect(await tasksOn({ inventoryUnitId: legacy.id })).toBe(0)
    expect((await prisma.checkLog.findFirst({ where: { itemId: bags.id, rigId: rig.id } }))?.condition).toBe('MISSING_PARTS')
  })

  it('an anonymous line returned INOPERABLE on the single route → the sweep brings a CHECKED_OUT legacy unit home AVAILABLE, no task', async () => {
    mockSession = operatorSession(op.id)
    const bags = await consumable()
    const legacy = await createInventoryUnit(bags.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op.id)
    const line = await prisma.kitItem.create({ data: { kitId: kit.id, inventoryItemId: bags.id, quantity: 1 } })
    const res = await singleReturn(req(`/api/deployments/${rig.id}/items/${line.id}`, 'DELETE', { returnCondition: 'INOPERABLE' }), p({ id: rig.id, kitItemId: line.id }))
    expect(res.status).toBe(200)
    expect(await unitStatus(legacy.id)).toBe('AVAILABLE')
    expect(await tasksOn({ inventoryUnitId: legacy.id })).toBe(0)
  })

  it('report-problem on a legacy unit still works', async () => {
    mockSession = operatorSession(op.id)
    const bags = await consumable()
    const legacy = await createInventoryUnit(bags.id, { status: 'CHECKED_OUT' })
    const { kit } = await createRig(op.id)
    await prisma.kitItem.create({ data: { kitId: kit.id, inventoryItemId: bags.id, quantity: 1, inventoryUnitId: legacy.id } })
    const res = await reportProblem(req(`/api/inventory/units/${legacy.id}/report-problem`, 'POST', { notes: 'bent', stillUsable: false }), p({ unitId: legacy.id }))
    expect(res.status).toBeLessThan(300)
    expect(await tasksOn({ inventoryUnitId: legacy.id })).toBe(1)
  })
})

describe('409, not 500 — the end, bulk and single routes map a ReferenceConflict', () => {
  beforeEach(() => { mockSession = operatorSession(op.id) })

  it('end', async () => {
    const { rig, kitItem } = await consumableOnRig()
    forceConflict.on = true
    const res = await endDeployment(req(`/api/deployments/${rig.id}/end`, 'POST', { itemDispositions: [{ kitItemId: kitItem.id, type: 'INOPERABLE', photoUrls: [] }] }), p({ id: rig.id }))
    expect(res.status).toBe(409)
    expect(await errorOf(res)).toBe('forced conflict')
    expect((await prisma.rig.findUnique({ where: { id: rig.id } }))?.endedAt).toBeNull()
  })

  it('bulk', async () => {
    const { rig, kitItem } = await consumableOnRig()
    forceConflict.on = true
    const res = await bulkReturn(req(`/api/deployments/${rig.id}/items`, 'DELETE', { itemDispositions: [{ kitItemId: kitItem.id, type: 'INOPERABLE', photoUrls: [] }] }), p({ id: rig.id }))
    expect(res.status).toBe(409)
    expect(await errorOf(res)).toBe('forced conflict')
  })

  it('single', async () => {
    const { rig, kitItem } = await consumableOnRig()
    forceConflict.on = true
    const res = await singleReturn(req(`/api/deployments/${rig.id}/items/${kitItem.id}`, 'DELETE', { returnCondition: 'INOPERABLE' }), p({ id: rig.id, kitItemId: kitItem.id }))
    expect(res.status).toBe(409)
    expect(await errorOf(res)).toBe('forced conflict')
  })
})

describe('Send for repair (D-g′) — POST /api/inventory/[id]/review-inoperable', () => {
  const sendForRepair = (itemId: string, unitId: string) =>
    reviewInoperable(req(`/api/inventory/${itemId}/review-inoperable`, 'POST', { unitId, decision: 'REPAIR', repairType: 'AT_SHOP', note: 'cracked' }), p({ id: itemId }))

  it('an AVAILABLE unit → repair task opened, unit In Maintenance, no bell', async () => {
    const item = await serialized()
    const u = await createInventoryUnit(item.id)
    const res = await sendForRepair(item.id, u.id)
    expect(res.status).toBe(200)
    expect(await unitStatus(u.id)).toBe('IN_MAINTENANCE')
    expect(await tasksOn({ inventoryUnitId: u.id })).toBe(1)
    expect(await prisma.alert.count({ where: { type: 'DAMAGE_REPORTED', resolved: false } })).toBe(0)
  })

  it('refuses a unit that is out (naming the deployment), Returning, or already in repair', async () => {
    const { item, unit, rig } = await unitOnRig()
    const out = await sendForRepair(item.id, unit.id)
    expect(out.status).toBe(409)
    const opName = (await prisma.user.findUnique({ where: { id: op.id } }))!.name
    expect(await errorOf(out)).toBe(`Out on ${opName}'s deployment — report it from the deployment, or send it for repair when it returns.`)
    await prisma.rig.update({ where: { id: rig.id }, data: { label: 'North block' } })
    expect(await errorOf(await sendForRepair(item.id, unit.id))).toBe('Out on North block — report it from the deployment, or send it for repair when it returns.')

    const returning = await createInventoryUnit(item.id, { status: 'IN_TRANSIT' })
    const r = await sendForRepair(item.id, returning.id)
    expect(r.status).toBe(409)
    expect(await errorOf(r)).toBe('Receive it at the hub first (Hubs → Inbound).')

    const inRepair = await createInventoryUnit(item.id, { status: 'IN_MAINTENANCE' })
    const m = await sendForRepair(item.id, inRepair.id)
    expect(m.status).toBe(409)
    expect(await errorOf(m)).toBe('Already in repair.')
  })

  it('RETIRE on an AVAILABLE unit is still refused (409)', async () => {
    const item = await serialized()
    const u = await createInventoryUnit(item.id)
    const res = await reviewInoperable(req(`/api/inventory/${item.id}/review-inoperable`, 'POST', { unitId: u.id, decision: 'RETIRE', note: 'done' }), p({ id: item.id }))
    expect(res.status).toBe(409)
    expect(await unitStatus(u.id)).toBe('AVAILABLE')
  })
})
