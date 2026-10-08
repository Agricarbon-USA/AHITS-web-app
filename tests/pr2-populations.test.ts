// PR-2 · One vocabulary for numbers — the populations, against a real DB.
//
// Node DB suite (CI-only here; no local Postgres). Each case is built to FAIL
// on the pre-PR-2 code:
//  - report: a retired unit was a row (and in assetCount); now it is not, while
//    its repair spend still counts (D-b / C-8);
//  - cron: a soft-deleted vehicle raised insurance alerts (only RETIRED was
//    filtered — S-9/P-4); serialized items never raised LOW_INVENTORY (C-9);
//  - dashboard: "Today's checks" compared `submittedAt` to server midnight, so a
//    6 pm Central check fell out of "today" once UTC rolled over (C-5/P-12).
// Cron runs use EMAIL_SANDBOX=1 and a stubbed dispatcher, so no alert costs a
// send attempt (tests/setup.ts also clears email_logs).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as equipmentReport } from '../src/app/api/reports/equipment/route'
import { GET as cronDispatch } from '../src/app/api/cron/dispatch/route'
import { GET as dashboardGET } from '../src/app/api/dashboard/route'
import { GET as inventoryGET } from '../src/app/api/inventory/route'
import { prisma } from '../src/lib/prisma'
import {
  createAdminUser, createOperator, createCategory, createInventoryItem,
  createInventoryUnit, createVehicle, createHub, adminSession,
} from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/notifications')>()),
  dispatchPendingAlerts: vi.fn().mockResolvedValue({ alerts: 0, notifications: 0, emailed: false }),
}))

const get = (url: string) => new NextRequest(`http://localhost${url}`)
const cronReq = () => new NextRequest('http://localhost/api/cron/dispatch', { headers: { authorization: 'Bearer test-cron-secret' } })

beforeEach(async () => {
  process.env.CRON_SECRET = 'test-cron-secret'
  vi.stubEnv('EMAIL_SANDBOX', '1')
  const admin = await createAdminUser()
  mockSession = adminSession(admin.id)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('equipment report populations (C-8, D-b)', () => {
  it('a retired unit is not a row or in assetCount, but its repair spend still counts', async () => {
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', name: 'Manual Corer' })
    const live = await createInventoryUnit(item.id)
    const retired = await createInventoryUnit(item.id, { status: 'RETIRED' })
    const done = new Date(Date.now() - 5 * 86_400_000)
    await prisma.maintenanceTask.create({
      data: {
        inventoryUnitId: retired.id, itemId: item.id, taskName: 'Replace tip',
        isDamageReport: true, status: 'COMPLETED', completedAt: done, actualCost: 120,
      },
    })

    const { data } = await (await equipmentReport(get('/api/reports/equipment'))).json()
    const ids = data.rows.map((r: { id: string }) => r.id)
    expect(ids).toContain(live.id)
    expect(ids).not.toContain(retired.id)
    expect(data.summary.assetCount).toBe(1)
    expect(data.summary.totalMaintenanceSpend).toBe(120)
  })

  it('a deleted vehicle is not a row; a never-done schedule is not an event or downtime', async () => {
    const gone = await createVehicle({ name: 'Truck-Gone' })
    await prisma.vehicle.update({ where: { id: gone.id }, data: { deletedAt: new Date() } })
    const truck = await createVehicle({ name: 'Truck-01' })
    await prisma.maintenanceTask.create({
      data: { vehicleId: truck.id, taskName: 'Oil change', intervalType: 'DAYS', intervalValue: 90, status: 'OVERDUE' },
    })

    const { data } = await (await equipmentReport(get('/api/reports/equipment'))).json()
    expect(data.rows.map((r: { id: string }) => r.id)).toEqual([truck.id])
    const row = data.rows[0]
    expect(row.maintenanceEvents).toBe(0)
    expect(row.downtimeDays).toBe(0)
  })

  it('a schedule rolled forward (completedAt null, lastCompleted set) is an event dated by lastCompleted', async () => {
    const truck = await createVehicle()
    await prisma.maintenanceTask.create({
      data: {
        vehicleId: truck.id, taskName: 'Grease', intervalType: 'DAYS', intervalValue: 30,
        status: 'UPCOMING', lastCompleted: new Date(Date.now() - 3 * 86_400_000), actualCost: 40,
      },
    })
    const { data } = await (await equipmentReport(get('/api/reports/equipment'))).json()
    expect(data.rows[0].maintenanceEvents).toBe(1)
    expect(data.summary.totalMaintenanceSpend).toBe(40)
  })
})

describe('cron populations (S-9/P-4, C-9)', () => {
  it('a soft-deleted vehicle raises no expiry alert', async () => {
    const soon = new Date(Date.now() + 5 * 86_400_000)
    const gone = await createVehicle()
    await prisma.vehicle.update({ where: { id: gone.id }, data: { deletedAt: new Date(), insuranceExpires: soon } })
    const live = await createVehicle()
    await prisma.vehicle.update({ where: { id: live.id }, data: { insuranceExpires: soon } })

    expect((await cronDispatch(cronReq())).status).toBe(200)
    const alerts = await prisma.alert.findMany({ where: { type: 'INSURANCE_EXPIRING', resolved: false } })
    expect(alerts.map((a) => a.sourceId)).toEqual([live.id])
  })

  it('serialized low stock: pickable units ≤ threshold raises, then clears when restocked', async () => {
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', name: 'GPS Rover' })
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { lowStockThreshold: 2 } })
    await createInventoryUnit(item.id)
    await createInventoryUnit(item.id, { status: 'CHECKED_OUT' }) // not pickable
    await createInventoryUnit(item.id, { status: 'IN_TRANSIT' }) // Returning — pickable since PR-3a (D-n)
    const sourceId = `${item.id}:serialized`

    await cronDispatch(cronReq())
    const raised = await prisma.alert.findFirst({ where: { type: 'LOW_INVENTORY', sourceId, resolved: false } })
    expect(raised).not.toBeNull()
    expect((raised!.metadata as { quantity: number }).quantity).toBe(2)

    await createInventoryUnit(item.id)
    await createInventoryUnit(item.id)
    await cronDispatch(cronReq())
    expect(await prisma.alert.count({ where: { type: 'LOW_INVENTORY', sourceId, resolved: false } })).toBe(0)
  })

  it('consumable low stock skips a deactivated hub and a retired item', async () => {
    const cat = await createCategory()
    const closed = await createHub({ name: 'Closed Hub' })
    await prisma.hub.update({ where: { id: closed.id }, data: { isActive: false } })
    const open = await createHub({ name: 'Open Hub' })
    const bags = await createInventoryItem(cat.id, { name: 'Sample bags', quantity: 2 })
    const old = await createInventoryItem(cat.id, { name: 'Old bags', quantity: 1, status: 'RETIRED' })
    for (const it of [bags, old]) {
      await prisma.inventoryItem.update({ where: { id: it.id }, data: { lowStockThreshold: 5 } })
    }
    await prisma.inventoryStock.createMany({
      data: [
        { itemId: bags.id, hubId: closed.id, quantity: 1 },
        { itemId: bags.id, hubId: open.id, quantity: 1 },
        { itemId: old.id, hubId: open.id, quantity: 1 },
      ],
    })

    await cronDispatch(cronReq())
    const ids = (await prisma.alert.findMany({ where: { type: 'LOW_INVENTORY', resolved: false } })).map((a) => a.sourceId)
    expect(ids).toEqual([`${bags.id}:${open.id}`])
  })
})

describe('dashboard "Today\'s checks" is the business day (C-5/P-12)', () => {
  it('a 6 pm Central check still counts as today at 9:30 pm Central (02:30 UTC next day)', async () => {
    // Only Date is faked — real timers keep Prisma's I/O working.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-08T02:30:00Z')) // 2026-10-07 21:30 CDT
    const op = await createOperator()
    const truck = await createVehicle()
    await prisma.dailyCheck.create({
      data: {
        vehicleId: truck.id, operatorId: op.id, checklistJson: [],
        date: new Date('2026-10-07'), submittedAt: new Date('2026-10-07T23:00:00Z'), // 18:00 CDT
      },
    })
    // Yesterday's check (business date 10-06) must not count.
    await prisma.dailyCheck.create({
      data: {
        vehicleId: truck.id, operatorId: op.id, checklistJson: [],
        date: new Date('2026-10-06'), submittedAt: new Date('2026-10-06T14:00:00Z'),
      },
    })

    const { data } = await (await dashboardGET()).json()
    expect(data.todayChecksSubmitted).toBe(1)
  })

  it('at 23:30 UTC (18:30 CDT), a 10 pm Central check from last night is yesterday — not today', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-07T23:30:00Z')) // 2026-10-07 18:30 CDT
    const op = await createOperator()
    const truck = await createVehicle()
    // Filed 03:00 UTC on the 7th = 22:00 CDT on the 6th → business date 10-06.
    // Server-midnight (UTC) code counted it as today.
    await prisma.dailyCheck.create({
      data: {
        vehicleId: truck.id, operatorId: op.id, checklistJson: [],
        date: new Date('2026-10-06'), submittedAt: new Date('2026-10-07T03:00:00Z'),
      },
    })
    const other = await createOperator()
    await prisma.dailyCheck.create({
      data: {
        vehicleId: truck.id, operatorId: other.id, checklistJson: [],
        date: new Date('2026-10-07'), submittedAt: new Date('2026-10-07T15:00:00Z'),
      },
    })

    const { data } = await (await dashboardGET()).json()
    expect(data.todayChecksSubmitted).toBe(1)
  })
})

describe('inventory payloads carry itemCounts (B3/C-6)', () => {
  it('list row: totals exclude retired; Returning has its own bucket', async () => {
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', name: 'Manual Corer' })
    for (let i = 0; i < 11; i++) await createInventoryUnit(item.id)
    for (const status of ['IN_MAINTENANCE', 'INOPERABLE', 'IN_TRANSIT', 'RETIRED']) {
      await createInventoryUnit(item.id, { status })
    }

    const body = await (await inventoryGET(get('/api/inventory'))).json()
    const row = body.data.find((r: { id: string }) => r.id === item.id)
    // PR-3a: the Returning unit is pickable (D-n), so available is 11 on the shelf + 1.
    expect(row.itemCounts).toMatchObject({ available: 12, out: 0, owned: 14, retired: 1, inTransit: 1 })

    const opts = await (await inventoryGET(get('/api/inventory?mode=options'))).json()
    const opt = opts.data.find((r: { id: string }) => r.id === item.id)
    expect(opt.itemCounts).toMatchObject({ available: 12, owned: 14, inTransit: 1 })
    // …and offered: the picker and the server agree.
    expect(opt.pickableUnits).toHaveLength(12)
  })

  it('consumable Out is the on-rig quantity; a legacy item with no stock rows keeps its quantity', async () => {
    const cat = await createCategory()
    const hub = await createHub()
    const bags = await createInventoryItem(cat.id, { name: 'Bags', quantity: 30 })
    await prisma.inventoryStock.create({ data: { itemId: bags.id, hubId: hub.id, quantity: 30 } })
    const legacy = await createInventoryItem(cat.id, { name: 'Legacy tape', quantity: 9 })
    const op = await createOperator()
    const rig = await prisma.rig.create({ data: { operatorId: op.id } })
    const kit = await prisma.kit.create({ data: { rigId: rig.id } })
    await prisma.kitItem.create({ data: { kitId: kit.id, inventoryItemId: bags.id, quantity: 6, drawnQuantity: 6, drawnHubId: hub.id } })

    const body = await (await inventoryGET(get('/api/inventory'))).json()
    const byId = new Map(body.data.map((r: { id: string; itemCounts: unknown }) => [r.id, r.itemCounts]))
    expect(byId.get(bags.id)).toMatchObject({ onHand: 30, out: 6, owned: 36, available: 30 })
    expect(byId.get(legacy.id)).toMatchObject({ onHand: 9, available: 9, owned: 9 })
  })
})
