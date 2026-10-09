// PR-3c (D-o · D-p · D-q · D-r · D-t · D-u): delete items (and restore them) — the
// guard, the one-stamp cascade, restore, the deleted view, the 410 on scan, checkout
// and picker exclusion, bulk delete, and the migration's backfill — against a real DB.
// Node DB suite (CI-only here; no local Postgres). Alerts are real; email and the
// alert dispatcher are stubbed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { prisma } from '../src/lib/prisma'
import { createAlert } from '../src/lib/alerts'
import { pickUnit } from '../src/lib/asset-status'
import { getLineChecklist } from '../src/lib/deployment-requests'
import { PATCH as patchItem, DELETE as deleteItemRoute } from '../src/app/api/inventory/[id]/route'
import { POST as restoreRoute } from '../src/app/api/inventory/[id]/restore/route'
import { POST as bulkDelete } from '../src/app/api/inventory/bulk-delete/route'
import { GET as inventoryList } from '../src/app/api/inventory/route'
import { GET as byQr } from '../src/app/api/inventory/units/by-qr/[qrCodeId]/route'
import { POST as createDeployment } from '../src/app/api/deployments/route'
import { POST as addItems } from '../src/app/api/deployments/[id]/items/route'
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
vi.mock('../src/lib/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/notifications')>()),
  dispatchPendingAlerts: vi.fn().mockResolvedValue({ alerts: 0, notifications: 0, emailed: false }),
}))

let keyCounter = 0
const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `pr3c-${++keyCounter}` },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
const p = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) })
const del = (id: string) => deleteItemRoute(req(`/api/inventory/${id}`, 'DELETE'), p({ id }))
const errorOf = async (res: Response) => (await res.json()).error as string

let admin: { id: string }
let op: { id: string; name: string }
let catId: string
beforeEach(async () => {
  vi.stubEnv('EMAIL_SANDBOX', '1')
  admin = await createAdminUser({ name: 'Max' })
  op = await createOperator({ name: 'Brett Hill', email: 'brett@test.example' })
  catId = (await createCategory()).id
  mockSession = adminSession(admin.id)
})
afterEach(() => { vi.unstubAllEnvs() })

const serialized = (name: string) => createInventoryItem(catId, { itemType: 'SERIALIZED', quantity: 0, name })

async function openRequest(status: string, line: Record<string, unknown>, label: string | null = 'Spring kit') {
  const r = await prisma.deploymentRequest.create({ data: { status: status as never, label, requestedById: op.id } })
  await prisma.deploymentRequestLine.create({ data: { requestId: r.id, lineType: 'KIT_ITEM', ...line } })
  return r
}

describe('the delete guard names what is in the way (D-t)', () => {
  it('units out or in repair', async () => {
    const item = await serialized('GPS rover')
    await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const res = await del(item.id)
    expect(res.status).toBe(409)
    expect(await errorOf(res)).toBe('1 unit is still out or in repair — get them back first.')
    expect((await prisma.inventoryItem.findUnique({ where: { id: item.id } }))?.deletedAt).toBeNull()
  })

  it('an open damage repair on one of its units (task has no itemId)', async () => {
    const item = await serialized('Corer')
    const unit = await createInventoryUnit(item.id)
    await prisma.maintenanceTask.create({ data: { taskName: 'Bent tip', isDamageReport: true, status: 'IN_PROGRESS', inventoryUnitId: unit.id } })
    const res = await del(item.id)
    expect(res.status).toBe(409)
    expect(await errorOf(res)).toBe('1 open repair — close it first.')
  })

  it('a kit line left open on an ENDED rig (a TRANSFER disposition on a consumable)', async () => {
    const item = await createInventoryItem(catId, { name: 'Bags', quantity: 5 })
    const { rig, kit } = await createRig(op.id)
    await prisma.kitItem.create({ data: { kitId: kit.id, inventoryItemId: item.id, quantity: 4 } })
    await prisma.rig.update({ where: { id: rig.id }, data: { endedAt: new Date() } })
    const res = await del(item.id)
    expect(res.status).toBe(409)
    expect(await errorOf(res)).toBe('4 of Bags are still on deployments — get them back first.')
  })

  it('an open request naming it refuses Delete AND Retire; a cancelled one does not', async () => {
    const item = await serialized('Tape measure')
    await openRequest('REQUESTED', { specificInventoryItemId: item.id })
    const res = await del(item.id)
    expect(res.status).toBe(409)
    expect(await errorOf(res)).toBe('Named on the open request "Spring kit" — edit or cancel it first.')
    const retire = await patchItem(req(`/api/inventory/${item.id}`, 'PATCH', { status: 'RETIRED' }), p({ id: item.id }))
    expect(retire.status).toBe(409)
    expect(await errorOf(retire)).toBe('Named on the open request "Spring kit" — edit or cancel it first.')

    await prisma.deploymentRequest.updateMany({ data: { status: 'CANCELLED' } })
    expect((await del(item.id)).status).toBe(200)
  })

  it('a request naming it as a substitute, or through a staged unit, also counts', async () => {
    const a = await serialized('Rover A')
    const unit = await createInventoryUnit(a.id)
    await openRequest('STAGED', { resolvedUnitId: unit.id }, null)
    await openRequest('FORWARDED', { substitutedItemId: a.id }, null)
    const res = await del(a.id)
    expect(await errorOf(res)).toBe('Named on 2 open requests — edit or cancel them first.')
  })

  it('unclaimed reservation holds', async () => {
    const item = await createInventoryItem(catId, { name: 'Bags', quantity: 5 })
    const hub = await createHub()
    await openRequest('FULFILLED', { heldItemId: item.id, heldHubId: hub.id, heldQty: 2, claimedQty: 0 })
    const res = await del(item.id)
    expect(await errorOf(res)).toBe('2 of Bags are held for a reservation — release or fulfil it first.')
  })

  it('units reserved on its stock rows', async () => {
    const item = await createInventoryItem(catId, { name: 'Bags', quantity: 5 })
    const hub = await createHub()
    await seedInventoryStock(item.id, hub.id, 5)
    await prisma.$executeRaw`UPDATE "inventory_stock" SET "reservedQty" = 3 WHERE "itemId" = ${item.id}`
    const res = await del(item.id)
    expect(await errorOf(res)).toBe('3 reserved on open requests — release the holds first.')
  })
})

describe('delete cascades with one stamp; restore reverses only that stamp (D-o · D-q · D-u)', () => {
  it('item, live units and schedules stamped; status, QR, stock and damage history untouched; alerts resolved', async () => {
    const item = await serialized('GPS rover')
    const hub = await createHub()
    await seedInventoryStock(item.id, hub.id, 5)
    const u1 = await createInventoryUnit(item.id, { serialNumber: 'A-1' })
    const u2 = await createInventoryUnit(item.id, { status: 'INOPERABLE' })
    const earlier = new Date('2026-01-01T00:00:00Z')
    const gone = await prisma.inventoryUnit.create({ data: { inventoryItemId: item.id, deletedAt: earlier } })
    const schedule = await prisma.maintenanceTask.create({ data: { taskName: 'Calibrate', itemId: item.id, isDamageReport: false } })
    const closedRepair = await prisma.maintenanceTask.create({
      data: { taskName: 'Old crack', itemId: item.id, isDamageReport: true, status: 'COMPLETED', completedAt: earlier },
    })
    await createAlert('LOW_INVENTORY', 'inventory_items', `${item.id}:${hub.id}`, {})
    await createAlert('LOW_INVENTORY', 'inventory_items', `${item.id}:serialized`, {})
    await createAlert('INVENTORY_DRIFT', 'inventory_items', item.id, {})
    await createAlert('DAMAGE_REPORTED', 'inventory_units', u2.id, {})
    const other = await serialized('Other')
    await createAlert('LOW_INVENTORY', 'inventory_items', `${other.id}:serialized`, {})

    const res = await del(item.id)
    expect(res.status).toBe(200)
    const body = await res.json()
    const stamp = new Date(body.deletedAt).getTime()

    const after = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(after.deletedAt?.getTime()).toBe(stamp)
    expect(after.deletedById).toBe(admin.id)
    const units = await prisma.inventoryUnit.findMany({ where: { inventoryItemId: item.id } })
    const byId = new Map(units.map((u) => [u.id, u]))
    expect(byId.get(u1.id)?.deletedAt?.getTime()).toBe(stamp)
    expect(byId.get(u2.id)?.deletedAt?.getTime()).toBe(stamp)
    expect(byId.get(gone.id)?.deletedAt?.getTime()).toBe(earlier.getTime())
    expect(byId.get(u1.id)?.status).toBe('AVAILABLE')
    expect(byId.get(u2.id)?.status).toBe('INOPERABLE')
    expect(byId.get(u1.id)?.qrCodeId).toBe(u1.qrCodeId)
    expect((await prisma.maintenanceTask.findUniqueOrThrow({ where: { id: schedule.id } })).deletedAt?.getTime()).toBe(stamp)
    expect((await prisma.maintenanceTask.findUniqueOrThrow({ where: { id: closedRepair.id } })).deletedAt).toBeNull()
    expect((await prisma.inventoryStock.findFirstOrThrow({ where: { itemId: item.id } })).quantity).toBe(5)
    const open = await prisma.alert.findMany({ where: { resolved: false }, select: { sourceId: true } })
    expect(open.map((a) => a.sourceId)).toEqual([`${other.id}:serialized`])

    // Restore: exactly what this delete hid.
    const r = await restoreRoute(req(`/api/inventory/${item.id}/restore`, 'POST'), p({ id: item.id }))
    expect(r.status).toBe(200)
    const back = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(back.deletedAt).toBeNull()
    expect(back.deletedById).toBeNull()
    const unitsBack = new Map((await prisma.inventoryUnit.findMany({ where: { inventoryItemId: item.id } })).map((u) => [u.id, u]))
    expect(unitsBack.get(u1.id)?.deletedAt).toBeNull()
    expect(unitsBack.get(u2.id)?.deletedAt).toBeNull()
    expect(unitsBack.get(gone.id)?.deletedAt?.getTime()).toBe(earlier.getTime())
    expect((await prisma.maintenanceTask.findUniqueOrThrow({ where: { id: schedule.id } })).deletedAt).toBeNull()
  })

  it('a deleted item is read-only until restored (409 "restore it first")', async () => {
    const item = await serialized('GPS rover')
    await del(item.id)
    const res = await patchItem(req(`/api/inventory/${item.id}`, 'PATCH', { notes: 'x' }), p({ id: item.id }))
    expect(res.status).toBe(409)
    expect(await errorOf(res)).toBe('GPS rover was deleted — restore it first.')
  })
})

describe('the deleted view (admin only, never a picker)', () => {
  it('operator → 403; with mode=options → 400; admin → only deleted items, who deleted them, same-stamp units', async () => {
    const item = await serialized('Old sampler')
    await createInventoryUnit(item.id)
    await createInventoryUnit(item.id)
    await prisma.inventoryUnit.create({ data: { inventoryItemId: item.id, deletedAt: new Date('2026-01-01T00:00:00Z') } })
    await serialized('Live item')
    await del(item.id)

    mockSession = operatorSession(op.id)
    expect((await inventoryList(req('/api/inventory?deleted=1', 'GET'))).status).toBe(403)
    mockSession = adminSession(admin.id)
    expect((await inventoryList(req('/api/inventory?deleted=1&mode=options', 'GET'))).status).toBe(400)

    const res = await inventoryList(req('/api/inventory?deleted=1', 'GET'))
    const body = await res.json()
    expect(body.data.map((i: { name: string }) => i.name)).toEqual(['Old sampler'])
    expect(body.data[0].deletedBy.name).toBe('Max')
    expect(body.data[0].units).toHaveLength(2)

    const live = await (await inventoryList(req('/api/inventory', 'GET'))).json()
    expect(live.data.map((i: { name: string }) => i.name)).toEqual(['Live item'])
  })
})

describe('a deleted unit\'s sticker answers 410 (D-r)', () => {
  it('names the item and the serial, or the unit\'s position among those deleted with it', async () => {
    const item = await serialized('GPS rover')
    const t0 = Date.now()
    const a = await prisma.inventoryUnit.create({ data: { inventoryItemId: item.id, serialNumber: 'A-7', createdAt: new Date(t0) } })
    const b = await prisma.inventoryUnit.create({ data: { inventoryItemId: item.id, createdAt: new Date(t0 + 1000) } })
    await del(item.id)

    const ra = await byQr(req(`/api/inventory/units/by-qr/${a.qrCodeId}`, 'GET'), p({ qrCodeId: a.qrCodeId }))
    expect(ra.status).toBe(410)
    expect(await errorOf(ra)).toBe('GPS rover (serial A-7) was deleted from inventory — an admin can restore it under Show deleted.')
    const rb = await byQr(req(`/api/inventory/units/by-qr/${b.qrCodeId}`, 'GET'), p({ qrCodeId: b.qrCodeId }))
    expect(await errorOf(rb)).toBe('GPS rover (unit 2) was deleted from inventory — an admin can restore it under Show deleted.')
  })
})

describe('checkout refuses deleted gear by name', () => {
  it('Start Deployment, add items, and pickUnit all answer "<name> was deleted from inventory"', async () => {
    const item = await serialized('GPS rover')
    const unit = await createInventoryUnit(item.id)
    await del(item.id)

    const start = await createDeployment(req('/api/deployments', 'POST', {
      operatorId: op.id, kitItems: [{ inventoryItemId: item.id, itemType: 'SERIALIZED', inventoryUnitId: unit.id }],
    }))
    expect(start.status).toBe(409)
    expect(await errorOf(start)).toBe('GPS rover was deleted from inventory')

    const { rig } = await createRig(op.id)
    mockSession = operatorSession(op.id)
    const add = await addItems(req(`/api/deployments/${rig.id}/items`, 'POST', {
      items: [{ itemType: 'SERIALIZED', inventoryItemId: item.id, inventoryUnitId: unit.id }],
    }), p({ id: rig.id }))
    expect(add.status).toBe(409)
    expect(await errorOf(add)).toBe('GPS rover was deleted from inventory')

    await expect(prisma.$transaction((tx) => pickUnit(tx, unit.id))).rejects.toThrow('GPS rover was deleted from inventory')
    expect((await prisma.inventoryUnit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe('AVAILABLE')
  })
})

describe('request pickers never offer deleted items', () => {
  it('the staging-unit picker skips a deleted item; the substitute picker skips deleted substitutes', async () => {
    const hub = await createHub()
    // Legacy shape (item deleted, unit not) — proves the item-level filter, not just the unit's.
    const gps = await serialized('GPS rover')
    await createInventoryUnit(gps.id)
    await prisma.inventoryItem.update({ where: { id: gps.id }, data: { deletedAt: new Date() } })
    const bags = await createInventoryItem(catId, { name: 'Bags', quantity: 5 })
    const liveSub = await createInventoryItem(catId, { name: 'Bags (blue)', quantity: 5 })
    const deadSub = await createInventoryItem(catId, { name: 'Bags (old)', quantity: 5 })
    await prisma.inventoryItem.update({ where: { id: deadSub.id }, data: { deletedAt: new Date() } })
    const r = await prisma.deploymentRequest.create({ data: { status: 'REQUESTED', requestedById: op.id } })
    await prisma.deploymentRequestLine.create({ data: { requestId: r.id, lineType: 'KIT_ITEM', itemType: 'SERIALIZED', specificInventoryItemId: gps.id } })
    await prisma.deploymentRequestLine.create({ data: { requestId: r.id, lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', specificInventoryItemId: bags.id } })

    for (const hubId of [null, hub.id]) {
      const { lines } = await getLineChecklist(r.id, hubId)
      const serialLine = lines.find((l) => l.specificInventoryItemId === gps.id)!
      const consumableLine = lines.find((l) => l.specificInventoryItemId === bags.id)!
      expect(serialLine.availableUnits).toEqual([])
      expect(consumableLine.substitutableItems.map((s) => s.id)).toEqual([liveSub.id])
    }
  })
})

describe('bulk delete answers per item, each in its own transaction (D-p)', () => {
  it('two deleted, one refused with its reason', async () => {
    const a = await serialized('A item')
    const b = await serialized('B item')
    await createInventoryUnit(b.id, { status: 'IN_MAINTENANCE' })
    const c = await serialized('C item')
    const res = await bulkDelete(req('/api/inventory/bulk-delete', 'POST', { ids: [a.id, b.id, c.id] }))
    expect(res.status).toBe(200)
    const { results } = await res.json()
    expect(results).toEqual([
      { id: a.id, name: 'A item', ok: true },
      { id: b.id, name: 'B item', ok: false, error: '1 unit is still out or in repair — get them back first.' },
      { id: c.id, name: 'C item', ok: true },
    ])
    const rows = await prisma.inventoryItem.findMany({ where: { id: { in: [a.id, b.id, c.id] } }, select: { id: true, deletedAt: true } })
    expect(rows.filter((r) => r.deletedAt).map((r) => r.id).sort()).toEqual([a.id, c.id].sort())

    mockSession = operatorSession(op.id)
    expect((await bulkDelete(req('/api/inventory/bulk-delete', 'POST', { ids: [a.id] }))).status).toBe(403)
  })
})

// ── The migration's backfill ─────────────────────────────────────────────────
// CI builds the test DB with `prisma db push`, so `deletedById` and its FK already
// exist — only the data statement is executed here.
const MIGRATION = path.resolve(__dirname, '../prisma/migrations/20261010120000_pr3c_item_deleted_by/migration.sql')
const backfill = () => readFileSync(MIGRATION, 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  .split(';').map((s) => s.trim()).find((s) => s.startsWith('UPDATE'))!

describe('migration backfill: units of items deleted before PR-3c take the item\'s stamp', () => {
  it('0 rows when there is nothing to do; stamps a legacy live unit once; idempotent', async () => {
    expect(await prisma.$executeRawUnsafe(backfill())).toBe(0)
    const item = await serialized('Legacy')
    const unit = await createInventoryUnit(item.id)
    const stamp = new Date('2026-06-01T12:00:00Z')
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { deletedAt: stamp } })
    expect(await prisma.$executeRawUnsafe(backfill())).toBe(1)
    expect((await prisma.inventoryUnit.findUniqueOrThrow({ where: { id: unit.id } })).deletedAt?.getTime()).toBe(stamp.getTime())
    expect(await prisma.$executeRawUnsafe(backfill())).toBe(0)
  })
})
