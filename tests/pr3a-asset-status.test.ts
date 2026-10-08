// PR-3a (RC-1): the status modules, helper by helper. Node DB suite (CI-only here; no
// local Postgres). Alerts are REAL — the assertions read the alert rows.
import { describe, it, expect, beforeEach } from 'vitest'
import type { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'
import {
  pickUnit, restoreIfClear, retireUnit, returnUnit,
} from '../src/lib/asset-status'
import { closeDamageTask, openDamageTask } from '../src/lib/maintenance'
import { PICKABLE_STATUSES } from '../src/lib/populations'
import {
  createAdminUser, createCategory, createHub, createInventoryItem, createInventoryUnit,
  createOperator, createRig, createVehicle,
} from './helpers/fixtures'

const tx = <T>(fn: (t: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn)

async function damageTask(data: { vehicleId?: string; inventoryUnitId?: string; itemId?: string; status?: 'IN_PROGRESS' | 'COMPLETED' }) {
  return prisma.maintenanceTask.create({
    data: { taskName: 'Damage', isDamageReport: true, status: data.status ?? 'IN_PROGRESS', ...data },
  })
}

const unitStatus = async (id: string) => (await prisma.inventoryUnit.findUnique({ where: { id } }))?.status
const vehicleStatus = async (id: string) => (await prisma.vehicle.findUnique({ where: { id } }))?.status

let itemId: string
let op: { id: string }
beforeEach(async () => {
  const cat = await createCategory()
  itemId = (await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0, name: 'GPS' })).id
  op = await createOperator()
})

describe('restoreIfClear', () => {
  it('vehicle with no other open report → ACTIVE', async () => {
    const v = await createVehicle({ status: 'IN_MAINTENANCE' })
    expect(await tx((t) => restoreIfClear(t, { kind: 'vehicle', id: v.id }))).toBe('ACTIVE')
    expect(await vehicleStatus(v.id)).toBe('ACTIVE')
  })

  it('one open report (not excluded) → stays IN_MAINTENANCE; excluding it → ACTIVE', async () => {
    const v = await createVehicle({ status: 'IN_MAINTENANCE' })
    const t1 = await damageTask({ vehicleId: v.id })
    expect(await tx((t) => restoreIfClear(t, { kind: 'vehicle', id: v.id }))).toBeNull()
    expect(await vehicleStatus(v.id)).toBe('IN_MAINTENANCE')
    expect(await tx((t) => restoreIfClear(t, { kind: 'vehicle', id: v.id }, { excludeTaskId: t1.id }))).toBe('ACTIVE')
  })

  it('two open reports, one excluded → still IN_MAINTENANCE (S-5)', async () => {
    const v = await createVehicle({ status: 'IN_MAINTENANCE' })
    const t1 = await damageTask({ vehicleId: v.id })
    await damageTask({ vehicleId: v.id })
    expect(await tx((t) => restoreIfClear(t, { kind: 'vehicle', id: v.id }, { excludeTaskId: t1.id }))).toBeNull()
    expect(await vehicleStatus(v.id)).toBe('IN_MAINTENANCE')
  })

  it('unit still in a live kit → CHECKED_OUT; no kit → AVAILABLE', async () => {
    const inKit = await createInventoryUnit(itemId, { status: 'IN_MAINTENANCE' })
    const { kit } = await createRig(op.id)
    await prisma.kitItem.create({ data: { kitId: kit.id, inventoryItemId: itemId, quantity: 1, inventoryUnitId: inKit.id } })
    const atHub = await createInventoryUnit(itemId, { status: 'IN_MAINTENANCE' })
    await tx((t) => restoreIfClear(t, { kind: 'unit', id: inKit.id }))
    await tx((t) => restoreIfClear(t, { kind: 'unit', id: atHub.id }))
    expect(await unitStatus(inKit.id)).toBe('CHECKED_OUT')
    expect(await unitStatus(atHub.id)).toBe('AVAILABLE')
  })

  it('never touches OUT_OF_SERVICE, INOPERABLE or RETIRED (D-c)', async () => {
    const v = await createVehicle({ status: 'OUT_OF_SERVICE' })
    const inop = await createInventoryUnit(itemId, { status: 'INOPERABLE' })
    const retired = await createInventoryUnit(itemId, { status: 'RETIRED' })
    await tx(async (t) => {
      await restoreIfClear(t, { kind: 'vehicle', id: v.id })
      await restoreIfClear(t, { kind: 'unit', id: inop.id })
      await restoreIfClear(t, { kind: 'unit', id: retired.id })
    })
    expect(await vehicleStatus(v.id)).toBe('OUT_OF_SERVICE')
    expect(await unitStatus(inop.id)).toBe('INOPERABLE')
    expect(await unitStatus(retired.id)).toBe('RETIRED')
  })
})

describe('returnUnit — the one return rule', () => {
  const task = () => ({ itemId, taskName: 'Damage repair: GPS', notes: null, rigId: null, reportedById: op.id })

  it('GOOD with a link to issue → IN_TRANSIT (Returning)', async () => {
    const u = await createInventoryUnit(itemId, { status: 'CHECKED_OUT' })
    expect(await tx((t) => returnUnit(t, u.id, { condition: 'GOOD', linked: true, task: task() }))).toBe('IN_TRANSIT')
    expect(await unitStatus(u.id)).toBe('IN_TRANSIT')
  })

  it('GOOD with no link possible → AVAILABLE', async () => {
    const u = await createInventoryUnit(itemId, { status: 'CHECKED_OUT' })
    expect(await tx((t) => returnUnit(t, u.id, { condition: 'GOOD', linked: false, task: task() }))).toBe('AVAILABLE')
  })

  for (const condition of ['IN_MAINTENANCE', 'INOPERABLE'] as const) {
    it(`${condition} → an open damage task that pulls the unit (never task-less, S-2)`, async () => {
      const u = await createInventoryUnit(itemId, { status: 'CHECKED_OUT' })
      expect(await tx((t) => returnUnit(t, u.id, { condition, linked: true, task: task() }))).toBe('IN_MAINTENANCE')
      expect(await unitStatus(u.id)).toBe('IN_MAINTENANCE')
      const open = await prisma.maintenanceTask.findMany({ where: { inventoryUnitId: u.id, isDamageReport: true, status: 'IN_PROGRESS' } })
      expect(open).toHaveLength(1)
      expect(await prisma.alert.count({ where: { type: 'DAMAGE_REPORTED', sourceId: open[0].id, resolved: false } })).toBe(1)
    })
  }

  it('already IN_MAINTENANCE → stays, its repair stays open, the hub is recorded as destination (D-d)', async () => {
    const hub = await createHub()
    const u = await createInventoryUnit(itemId, { status: 'IN_MAINTENANCE' })
    const t1 = await damageTask({ inventoryUnitId: u.id, itemId })
    expect(await tx((t) => returnUnit(t, u.id, { condition: 'GOOD', hubId: hub.id, linked: true, task: task() }))).toBe('IN_MAINTENANCE')
    const after = await prisma.maintenanceTask.findUnique({ where: { id: t1.id } })
    expect(after?.status).toBe('IN_PROGRESS')
    expect(after?.returnDestinationType).toBe('HUB')
    expect(after?.returnDestinationId).toBe(hub.id)
    expect(await unitStatus(u.id)).toBe('IN_MAINTENANCE')
  })
})

describe('pickUnit (D-e, D-n)', () => {
  it('PICKABLE_STATUSES is AVAILABLE + IN_TRANSIT', () => {
    expect([...PICKABLE_STATUSES]).toEqual(['AVAILABLE', 'IN_TRANSIT'])
  })

  it('AVAILABLE → CHECKED_OUT', async () => {
    const u = await createInventoryUnit(itemId)
    expect(await tx((t) => pickUnit(t, u.id))).toBe(true)
    expect(await unitStatus(u.id)).toBe('CHECKED_OUT')
  })

  it('IN_TRANSIT → CHECKED_OUT and its open HUB_RETURN link is completed with an event', async () => {
    const admin = await createAdminUser()
    const u = await createInventoryUnit(itemId, { status: 'IN_TRANSIT' })
    const link = await prisma.statusLink.create({
      data: { type: 'HUB_RETURN', tokenHash: `h-${u.id}`, expiresAt: new Date(Date.now() + 864e5), inventoryUnitId: u.id, createdById: admin.id },
    })
    expect(await tx((t) => pickUnit(t, u.id, { actorLabel: 'Field Op' }))).toBe(true)
    expect(await unitStatus(u.id)).toBe('CHECKED_OUT')
    const after = await prisma.statusLink.findUnique({ where: { id: link.id } })
    expect(after?.state).toBe('COMPLETED')
    expect(after?.completedAt).not.toBeNull()
    const ev = await prisma.statusLinkEvent.findFirst({ where: { statusLinkId: link.id } })
    expect(ev?.note).toMatch(/re-deployed before hub receipt/i)
  })

  it('refuses a unit that is not pickable, or soft-deleted, or of another item', async () => {
    const inMaint = await createInventoryUnit(itemId, { status: 'IN_MAINTENANCE' })
    const gone = await createInventoryUnit(itemId)
    await prisma.inventoryUnit.update({ where: { id: gone.id }, data: { deletedAt: new Date() } })
    const ok = await createInventoryUnit(itemId)
    expect(await tx((t) => pickUnit(t, inMaint.id))).toBe(false)
    expect(await tx((t) => pickUnit(t, gone.id))).toBe(false)
    expect(await tx((t) => pickUnit(t, ok.id, { inventoryItemId: 'some-other-item' }))).toBe(false)
    expect(await unitStatus(inMaint.id)).toBe('IN_MAINTENANCE')
    expect(await unitStatus(ok.id)).toBe('AVAILABLE')
  })
})

describe('retireUnit', () => {
  it('RETIRED, QR released with ::retired::, open repairs closed, the unit\'s alerts resolved', async () => {
    const u = await createInventoryUnit(itemId, { status: 'INOPERABLE' })
    const qr = u.qrCodeId
    const t1 = await damageTask({ inventoryUnitId: u.id, itemId })
    await prisma.alert.create({ data: { type: 'DAMAGE_REPORTED', sourceTable: 'inventory_units', sourceId: u.id, activeKey: `DAMAGE_REPORTED:inventory_units:${u.id}` } })
    await prisma.alert.create({ data: { type: 'DAMAGE_REPORTED', sourceTable: 'maintenance_tasks', sourceId: t1.id, activeKey: `DAMAGE_REPORTED:maintenance_tasks:${t1.id}` } })

    await tx((t) => retireUnit(t, u.id, 'beyond repair'))

    const after = await prisma.inventoryUnit.findUnique({ where: { id: u.id } })
    expect(after?.status).toBe('RETIRED')
    expect(after?.qrCodeId.startsWith(`${qr}::retired::`)).toBe(true)
    const task = await prisma.maintenanceTask.findUnique({ where: { id: t1.id } })
    expect(task?.status).toBe('COMPLETED')
    expect(task?.notes).toMatch(/unit retired/i)
    expect(await prisma.alert.count({ where: { resolved: false } })).toBe(0)
    expect(await prisma.alert.count({ where: { activeKey: { not: null } } })).toBe(0)
  })
})

describe('openDamageTask', () => {
  const fields = (over: Partial<Parameters<typeof openDamageTask>[2]> = {}) => ({
    taskName: 'Damage report', notes: 'first', reportedById: op.id, source: 'REPORT' as const, pull: true, ...over,
  })

  it('creates the task, raises DAMAGE_REPORTED and pulls the asset', async () => {
    const v = await createVehicle()
    const { task, created } = await tx((t) => openDamageTask(t, { kind: 'vehicle', id: v.id }, fields()))
    expect(created).toBe(true)
    expect(await vehicleStatus(v.id)).toBe('IN_MAINTENANCE')
    expect(await prisma.alert.count({ where: { type: 'DAMAGE_REPORTED', sourceId: task.id, resolved: false } })).toBe(1)
  })

  it('a second report on the same asset joins the open task (one open task per asset, S-5)', async () => {
    const v = await createVehicle()
    const a = await tx((t) => openDamageTask(t, { kind: 'vehicle', id: v.id }, fields()))
    const b = await tx((t) => openDamageTask(t, { kind: 'vehicle', id: v.id }, fields({ notes: 'second' })))
    expect(b.created).toBe(false)
    expect(b.task.id).toBe(a.task.id)
    expect(await prisma.maintenanceTask.count({ where: { vehicleId: v.id } })).toBe(1)
    const t = await prisma.maintenanceTask.findUnique({ where: { id: a.task.id } })
    expect(t?.notes).toContain('first')
    expect(t?.notes).toContain('second')
  })

  it('pull: false ("Still usable", D29) leaves the unit CHECKED_OUT with its task open', async () => {
    const u = await createInventoryUnit(itemId, { status: 'CHECKED_OUT' })
    await tx((t) => openDamageTask(t, { kind: 'unit', id: u.id, itemId }, fields({ pull: false })))
    expect(await unitStatus(u.id)).toBe('CHECKED_OUT')
    expect(await prisma.maintenanceTask.count({ where: { inventoryUnitId: u.id, status: 'IN_PROGRESS' } })).toBe(1)
  })

  it('never overwrites an admin OUT_OF_SERVICE (D-c)', async () => {
    const v = await createVehicle({ status: 'OUT_OF_SERVICE' })
    await tx((t) => openDamageTask(t, { kind: 'vehicle', id: v.id }, fields()))
    expect(await vehicleStatus(v.id)).toBe('OUT_OF_SERVICE')
  })

  it('admin triage sources (DAILY_CHECK, ADMIN_REVIEW) do not ring the bell', async () => {
    const v = await createVehicle()
    const { task } = await tx((t) => openDamageTask(t, { kind: 'vehicle', id: v.id }, fields({ source: 'DAILY_CHECK' })))
    expect(await prisma.alert.count({ where: { sourceId: task.id } })).toBe(0)
  })
})

describe('closeDamageTask', () => {
  it('COMPLETED: closed, alerts resolved, asset restored when clear', async () => {
    const v = await createVehicle({ status: 'IN_MAINTENANCE' })
    const t1 = await damageTask({ vehicleId: v.id })
    await prisma.alert.create({ data: { type: 'DAMAGE_REPORTED', sourceTable: 'maintenance_tasks', sourceId: t1.id, activeKey: `DAMAGE_REPORTED:maintenance_tasks:${t1.id}` } })
    await tx((t) => closeDamageTask(t, t1.id, 'COMPLETED'))
    const after = await prisma.maintenanceTask.findUnique({ where: { id: t1.id } })
    expect(after?.status).toBe('COMPLETED')
    expect(after?.completedAt).not.toBeNull()
    expect(await prisma.alert.count({ where: { sourceId: t1.id, resolved: false } })).toBe(0)
    expect(await vehicleStatus(v.id)).toBe('ACTIVE')
  })

  it('COMPLETED with another open report on the asset → stays IN_MAINTENANCE', async () => {
    const v = await createVehicle({ status: 'IN_MAINTENANCE' })
    const t1 = await damageTask({ vehicleId: v.id })
    await damageTask({ vehicleId: v.id })
    await tx((t) => closeDamageTask(t, t1.id, 'COMPLETED'))
    expect(await vehicleStatus(v.id)).toBe('IN_MAINTENANCE')
  })

  it('FIELD_FIX: COMPLETED with resolutionPath IN_FIELD', async () => {
    const v = await createVehicle({ status: 'IN_MAINTENANCE' })
    const t1 = await damageTask({ vehicleId: v.id })
    await tx((t) => closeDamageTask(t, t1.id, 'FIELD_FIX'))
    const after = await prisma.maintenanceTask.findUnique({ where: { id: t1.id } })
    expect(after?.status).toBe('COMPLETED')
    expect(after?.resolutionPath).toBe('IN_FIELD')
    expect(await vehicleStatus(v.id)).toBe('ACTIVE')
  })

  it('DELETED: soft-deleted, and the asset is released', async () => {
    const u = await createInventoryUnit(itemId, { status: 'IN_MAINTENANCE' })
    const t1 = await damageTask({ inventoryUnitId: u.id, itemId })
    await tx((t) => closeDamageTask(t, t1.id, 'DELETED'))
    expect((await prisma.maintenanceTask.findUnique({ where: { id: t1.id } }))?.deletedAt).not.toBeNull()
    expect(await unitStatus(u.id)).toBe('AVAILABLE')
  })

  it('RETIRED: COMPLETED with "unit retired" in the notes', async () => {
    const u = await createInventoryUnit(itemId, { status: 'RETIRED' })
    const t1 = await damageTask({ inventoryUnitId: u.id, itemId })
    await tx((t) => closeDamageTask(t, t1.id, 'RETIRED'))
    const after = await prisma.maintenanceTask.findUnique({ where: { id: t1.id } })
    expect(after?.status).toBe('COMPLETED')
    expect(after?.notes).toMatch(/unit retired/i)
    expect(await unitStatus(u.id)).toBe('RETIRED')
  })

  it('REOPEN: back to IN_PROGRESS, completedAt cleared, the asset pulled again (U-7)', async () => {
    const v = await createVehicle({ status: 'ACTIVE' })
    const t1 = await damageTask({ vehicleId: v.id, status: 'COMPLETED' })
    await prisma.maintenanceTask.update({ where: { id: t1.id }, data: { completedAt: new Date() } })
    await tx((t) => closeDamageTask(t, t1.id, 'REOPEN'))
    const after = await prisma.maintenanceTask.findUnique({ where: { id: t1.id } })
    expect(after?.status).toBe('IN_PROGRESS')
    expect(after?.completedAt).toBeNull()
    expect(await vehicleStatus(v.id)).toBe('IN_MAINTENANCE')
  })

  it('legacy item-only task (UR-029): restores the one IN_MAINTENANCE unit, never guesses between two', async () => {
    const only = await createInventoryUnit(itemId, { status: 'IN_MAINTENANCE' })
    const t1 = await damageTask({ itemId })
    await tx((t) => closeDamageTask(t, t1.id, 'COMPLETED'))
    expect(await unitStatus(only.id)).toBe('AVAILABLE')

    const a = await createInventoryUnit(itemId, { status: 'IN_MAINTENANCE' })
    const b = await createInventoryUnit(itemId, { status: 'IN_MAINTENANCE' })
    const t2 = await damageTask({ itemId })
    await tx((t) => closeDamageTask(t, t2.id, 'COMPLETED'))
    expect(await unitStatus(a.id)).toBe('IN_MAINTENANCE')
    expect(await unitStatus(b.id)).toBe('IN_MAINTENANCE')
  })
})
