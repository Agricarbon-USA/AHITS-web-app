// PR-1b (L-2 / L-6 / C-3 / C-4): the picker set is COMPLETE, and the dashboard
// chips are server counts.
//
// Node DB suite (CI-only here; no local Postgres). The bug being closed: every
// picker fetched `/api/inventory?pageSize=100|200`, which `parsePagination`
// clamps to 100 — so item 101 onward could not be packed, reserved, scheduled or
// field-fixed, and typing its name said "No options" because the filter ran
// client-side over a list that never contained it. The acceptance is literal:
// 101 items in, 101 options out.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as inventoryGET } from '../src/app/api/inventory/route'
import { GET as feedsGET } from '../src/app/api/dashboard/feeds/route'
import { GET as operatorsGET } from '../src/app/api/operators/route'
import { PICKABLE_STATUSES } from '../src/lib/populations'
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

const get = (url: string) => new NextRequest(`http://localhost${url}`)
const options = async (qs = '') => {
  const res = await inventoryGET(get(`/api/inventory?mode=options${qs}`))
  return res.json()
}

describe('GET /api/inventory?mode=options — the complete pickable set (PR-1b)', () => {
  let admin: Awaited<ReturnType<typeof createAdminUser>>
  let categoryId: string

  beforeEach(async () => {
    admin = await createAdminUser()
    mockSession = adminSession(admin.id)
    categoryId = (await createCategory({ name: 'Sampling' })).id
  })

  it('offers all 101 items — the acceptance the 100-row clamp failed', async () => {
    // Names are deliberately ordered so item 101 sorts LAST: under `pageSize=100`
    // it was the one row that fell off the end and became unpickable.
    for (let i = 1; i <= 101; i++) {
      await createInventoryItem(categoryId, { name: `Item ${String(i).padStart(3, '0')}`, quantity: 5 })
    }
    const body = await options()
    expect(body.data.length).toBe(101)
    expect(body.total).toBe(101)
    expect(body.truncated).toBe(false)
    expect(body.data.map((i: { name: string }) => i.name)).toContain('Item 101')
  })

  it('narrows on `q` server-side, so typing finds an item past the old cap', async () => {
    for (let i = 1; i <= 101; i++) {
      await createInventoryItem(categoryId, { name: `Item ${String(i).padStart(3, '0')}`, quantity: 5 })
    }
    await createInventoryItem(categoryId, { name: 'Zinc probe', quantity: 1 })
    const body = await options('&q=zinc')
    expect(body.data.map((i: { name: string }) => i.name)).toEqual(['Zinc probe'])
  })

  it('excludes RETIRED items — a picker has no "Show retired" door (D-a)', async () => {
    await createInventoryItem(categoryId, { name: 'Live item', quantity: 1 })
    await createInventoryItem(categoryId, { name: 'Dead item', quantity: 1, status: 'RETIRED' })
    const names = (await options()).data.map((i: { name: string }) => i.name)
    expect(names).toContain('Live item')
    expect(names).not.toContain('Dead item')
  })

  it('categoryName is a string for an item with no category row (2026-10-09 staging crash)', async () => {
    // An item created through the API without categoryId has only the legacy enum.
    // categoryName came back as {id,name}, and My Deployment's picker sort threw.
    const bare = await createInventoryItem(categoryId, { name: 'Bare item', quantity: 1 })
    await prisma.inventoryItem.update({ where: { id: bare.id }, data: { categoryId: null } })
    const row = (await options()).data.find((i: { name: string }) => i.name === 'Bare item')
    expect(typeof row.categoryName).toBe('string')
    expect(row.categoryId).toBeNull()
  })

  it('excludes soft-deleted items', async () => {
    const gone = await createInventoryItem(categoryId, { name: 'Deleted item', quantity: 1 })
    await prisma.inventoryItem.update({ where: { id: gone.id }, data: { deletedAt: new Date() } })
    const names = (await options()).data.map((i: { name: string }) => i.name)
    expect(names).not.toContain('Deleted item')
  })

  it('offers AVAILABLE units only — never one the server would refuse (D-n)', async () => {
    const item = await createInventoryItem(categoryId, { name: 'Corer', itemType: 'SERIALIZED' })
    await createInventoryUnit(item.id, { status: 'AVAILABLE', serialNumber: 'A-1' })
    await createInventoryUnit(item.id, { status: 'CHECKED_OUT', serialNumber: 'A-2' })
    await createInventoryUnit(item.id, { status: 'IN_MAINTENANCE', serialNumber: 'A-3' })
    await createInventoryUnit(item.id, { status: 'INOPERABLE', serialNumber: 'A-4' })
    await createInventoryUnit(item.id, { status: 'RETIRED', serialNumber: 'A-5' })

    const row = (await options()).data.find((i: { name: string }) => i.name === 'Corer')
    expect(row.pickableUnits.map((u: { serialNumber: string }) => u.serialNumber)).toEqual(['A-1'])
  })

  it('offers IN_TRANSIT ("Returning") since PR-3a widened PICKABLE_STATUSES with pickUnit (D-e, D-n)', async () => {
    const item = await createInventoryItem(categoryId, { name: 'Returning corer', itemType: 'SERIALIZED' })
    await createInventoryUnit(item.id, { status: 'IN_TRANSIT', serialNumber: 'T-1' })
    await createInventoryUnit(item.id, { status: 'AVAILABLE', serialNumber: 'T-2' })

    // The contract this test pins: the picker offers exactly what the server
    // accepts. PR-3a flipped BOTH in one commit (pickUnit accepts a Returning unit).
    expect([...PICKABLE_STATUSES]).toEqual(['AVAILABLE', 'IN_TRANSIT'])
    const row = (await options()).data.find((i: { name: string }) => i.name === 'Returning corer')
    expect(row.pickableUnits.map((u: { serialNumber: string }) => u.serialNumber).sort()).toEqual(['T-1', 'T-2'])
  })

  it('numbers a unit by its position among ALL units, not among the free ones (UXP-6 T8)', async () => {
    const item = await createInventoryItem(categoryId, { name: 'Three corer', itemType: 'SERIALIZED' })
    await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    await createInventoryUnit(item.id, { status: 'AVAILABLE' })

    const row = (await options()).data.find((i: { name: string }) => i.name === 'Three corer')
    expect(row.pickableUnits).toHaveLength(1)
    // "Unit 3", not "Unit 1" — the number the inventory drawer shows.
    expect(row.pickableUnits[0].position).toBe(3)
  })

  it('keeps an item whose units are all out — a field fix is logged against gear that is OUT', async () => {
    const item = await createInventoryItem(categoryId, { name: 'All out', itemType: 'SERIALIZED' })
    await createInventoryUnit(item.id, { status: 'CHECKED_OUT', serialNumber: 'X-1' })
    const row = (await options()).data.find((i: { name: string }) => i.name === 'All out')
    expect(row).toBeTruthy()
    expect(row.pickableUnits).toEqual([])
  })

  it('falls back to the stored quantity for a consumable with no stock rows', async () => {
    // A legacy item that was never backfilled into `inventory_stock`. Summing an
    // empty `availableByHub` would read 0 and make it look unpickable.
    await createInventoryItem(categoryId, { name: 'Legacy bags', quantity: 40 })
    const row = (await options()).data.find((i: { name: string }) => i.name === 'Legacy bags')
    expect(row.availableByHub).toEqual([])
    expect(row.availableQuantity).toBe(40)
  })

  it('is not paginated — `pageSize` cannot shrink it', async () => {
    for (let i = 1; i <= 101; i++) {
      await createInventoryItem(categoryId, { name: `Item ${String(i).padStart(3, '0')}`, quantity: 1 })
    }
    // The clamp that caused the bug is simply not on this path.
    const body = await inventoryGET(get('/api/inventory?mode=options&pageSize=10&page=3')).then((r) => r.json())
    expect(body.data.length).toBe(101)
  })

  it('401s without a session', async () => {
    mockSession = null
    expect((await inventoryGET(get('/api/inventory?mode=options'))).status).toBe(401)
  })
})

describe('GET /api/operators — active people only, with their home hub (PR-1b, L-7)', () => {
  beforeEach(async () => {
    const admin = await createAdminUser()
    mockSession = adminSession(admin.id)
  })

  it('omits a deactivated operator, so no picker can offer them', async () => {
    const live = await createOperator({ name: 'Active Op' })
    const gone = await createOperator({ name: 'Deactivated Op' })
    await prisma.user.update({ where: { id: gone.id }, data: { isActive: false } })

    const body = await operatorsGET(get('/api/operators'), undefined as never).then((r: Response) => r.json())
    const names = body.data.map((u: { name: string }) => u.name)
    expect(names).toContain(live.name)
    expect(names).not.toContain('Deactivated Op')
  })

  it('carries homeHubId — the deployment drawer prefills the return hub from it', async () => {
    const hub = await createHub()
    const op = await createOperator({ name: 'Hubbed Op' })
    await prisma.user.update({ where: { id: op.id }, data: { homeHubId: hub.id } })

    const body = await operatorsGET(get('/api/operators'), undefined as never).then((r: Response) => r.json())
    const row = body.data.find((u: { id: string }) => u.id === op.id)
    // `OperatorRow.homeHubId` is optional, so a missing field here would type-check,
    // lint and test clean while the prefill silently stopped working.
    expect(row.homeHubId).toBe(hub.id)
  })
})

describe('GET /api/dashboard/feeds — chips are server counts (PR-1b, L-6/C-3/C-4)', () => {
  beforeEach(async () => {
    const admin = await createAdminUser()
    mockSession = adminSession(admin.id)
  })

  it('counts every due-soon task, not the 15 the feed lists', async () => {
    const vehicle = await createVehicle()
    const soon = new Date(Date.now() + 2 * 86_400_000)
    for (let i = 0; i < 18; i++) {
      await prisma.maintenanceTask.create({
        data: {
          vehicleId: vehicle.id, taskName: `Service ${i}`, intervalType: 'DAYS',
          intervalValue: 30, status: 'UPCOMING', nextDue: soon,
        },
      })
    }
    const body = await feedsGET().then((r) => r.json())
    // The rows stay capped at 15 — the chip must not.
    expect(body.data.maintenanceDueSoon.length).toBe(15)
    expect(body.data.counts.maintenanceDueSoon).toBe(18)
  })

  it('counts every long-running rig, not the 15 the feed lists', async () => {
    const operator = await createOperator()
    const startedAt = new Date(Date.now() - 60 * 86_400_000)
    for (let i = 0; i < 17; i++) {
      await prisma.rig.create({ data: { label: `Rig ${i}`, startedAt, operatorId: operator.id } })
    }
    const body = await feedsGET().then((r) => r.json())
    expect(body.data.longRunning.length).toBe(15)
    expect(body.data.counts.longRunning).toBe(17)
  })
})
