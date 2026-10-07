// PR-1a (RC-2 / D-h): "a view shows everything that matches or says exactly how
// much it is not showing."
//
// Node DB suite (CI-only here; no local Postgres). Three things are proven:
//  1. `parsePagination` / `listResponse` — the arithmetic of `clamped` and
//     `truncated`. Pure, no DB.
//  2. `/api/maintenance?tab=…` — the tab is a SERVER filter, each facet count
//     equals the row count of its own tab, and the DEFAULT is every task (the
//     operator's `?rigId=` read must keep seeing scheduled tasks; D21 forbids
//     editing my-deployment to compensate).
//  3. `GET /api/maintenance/[id]` — the endpoint an alert's "View" link needs,
//     and the stable `orderBy` tiebreaker: paging through tasks that share a
//     status and due date must never skip one row and show another twice.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { parsePagination, listResponse } from '../src/lib/validation'
import { GET as listMaintenance } from '../src/app/api/maintenance/route'
import { GET as getMaintenance } from '../src/app/api/maintenance/[id]/route'
import { prisma } from '../src/lib/prisma'
import { createAdminUser, createOperator, createVehicle, adminSession } from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))

const params = (qs: string) => new URLSearchParams(qs)
const get = (url: string) => new NextRequest(`http://localhost${url}`)

describe('parsePagination (PR-1a)', () => {
  it('defaults to page 1 at the default size, unclamped', () => {
    expect(parsePagination(params(''))).toEqual({ page: 1, pageSize: 25, skip: 0, clamped: false })
  })

  it('computes skip from the 1-based page', () => {
    expect(parsePagination(params('page=3&pageSize=50'))).toEqual({ page: 3, pageSize: 50, skip: 100, clamped: false })
  })

  it('reports `clamped` when the caller asked for more than the cap', () => {
    const p = parsePagination(params('pageSize=1000000'))
    expect(p.pageSize).toBe(100)
    expect(p.clamped).toBe(true)
  })

  it('does not report `clamped` for a request exactly at the cap', () => {
    expect(parsePagination(params('pageSize=100')).clamped).toBe(false)
  })

  it('does not report `clamped` when no pageSize was asked for', () => {
    expect(parsePagination(params('page=2'), { defaultSize: 10, maxSize: 20 }).clamped).toBe(false)
  })

  it('falls back to sane values for NaN, zero and negative input', () => {
    expect(parsePagination(params('page=abc&pageSize=-5'))).toEqual({ page: 1, pageSize: 25, skip: 0, clamped: false })
    expect(parsePagination(params('page=0'))).toMatchObject({ page: 1 })
  })
})

describe('listResponse (PR-1a)', () => {
  it('is not truncated when one page holds everything', () => {
    const env = listResponse([1, 2, 3], 3, { page: 1, pageSize: 100 })
    expect(env).toEqual({ data: [1, 2, 3], total: 3, page: 1, pageSize: 100, truncated: false })
  })

  it('is truncated when this page does not reach the end', () => {
    expect(listResponse(new Array(100).fill(0), 160, { page: 1, pageSize: 100 }).truncated).toBe(true)
  })

  it('is NOT truncated on the last page of a multi-page list', () => {
    expect(listResponse(new Array(60).fill(0), 160, { page: 2, pageSize: 100 }).truncated).toBe(false)
  })

  it('is truncated whenever the request was clamped, even if the page looks complete', () => {
    // The caller asked for 1000 rows and got 100 of 100 — complete by accident
    // of the data, but the request was cut down and the client must know.
    expect(listResponse(new Array(100).fill(0), 100, { page: 1, pageSize: 100, clamped: true }).truncated).toBe(true)
  })

  it('reports a hard-capped unpaginated read as truncated (the bell/alerts/status-links case)', () => {
    // 30 of 94 notifications, page 1 of a cap that offers no page 2 — this is
    // exactly the shape that made a capped list look like the whole list (L-5).
    const env = listResponse(new Array(30).fill(0), 94, { page: 1, pageSize: 30 })
    expect(env.total).toBe(94)
    expect(env.truncated).toBe(true)
  })

  it('is not truncated on an empty result', () => {
    expect(listResponse([], 0, { page: 1, pageSize: 100 }).truncated).toBe(false)
  })
})

describe('/api/maintenance — the tab is a server filter (PR-1a)', () => {
  let admin: Awaited<ReturnType<typeof createAdminUser>>
  let vehicle: Awaited<ReturnType<typeof createVehicle>>

  beforeEach(async () => {
    admin = await createAdminUser()
    mockSession = adminSession(admin.id)
    vehicle = await createVehicle()
  })

  /** 40 tasks: 12 open damage reports, 3 overdue schedules, 1 in progress, 24 completed. */
  async function seedForty() {
    const rows: { taskName: string; status: string; isDamageReport: boolean }[] = []
    for (let i = 0; i < 12; i++) rows.push({ taskName: `damage ${i}`, status: 'UPCOMING', isDamageReport: true })
    for (let i = 0; i < 3; i++) rows.push({ taskName: `overdue ${i}`, status: 'OVERDUE', isDamageReport: false })
    rows.push({ taskName: 'in progress', status: 'IN_PROGRESS', isDamageReport: false })
    for (let i = 0; i < 24; i++) rows.push({ taskName: `done ${i}`, status: 'COMPLETED', isDamageReport: false })
    for (const r of rows) {
      await prisma.maintenanceTask.create({
        data: {
          vehicleId: vehicle.id, taskName: r.taskName, intervalType: 'DAYS', intervalValue: 30,
          status: r.status as never, isDamageReport: r.isDamageReport,
        },
      })
    }
  }

  it('each facet count equals the row count of its own tab', async () => {
    await seedForty()
    const facetRes = await listMaintenance(get('/api/maintenance?tab=damage&pageSize=100'))
    const { facets } = await facetRes.json()
    expect(facets).toEqual({ damage: 12, overdue: 3, active: 1, completed: 24 })

    for (const [tab, expected] of Object.entries(facets) as [string, number][]) {
      const res = await listMaintenance(get(`/api/maintenance?tab=${tab}&pageSize=100`))
      const body = await res.json()
      expect(body.total, tab).toBe(expected)
      expect(body.data.length, tab).toBe(expected)
      // The facets travel with every tab and never change — they describe the
      // whole base population, not the tab in hand.
      expect(body.facets, tab).toEqual(facets)
    }
  })

  it('a damage report that has been completed is in neither the damage tab nor its count', async () => {
    await prisma.maintenanceTask.create({
      data: { vehicleId: vehicle.id, taskName: 'fixed', intervalType: 'DAYS', intervalValue: 30, status: 'COMPLETED', isDamageReport: true },
    })
    const res = await listMaintenance(get('/api/maintenance?tab=damage'))
    const body = await res.json()
    expect(body.total).toBe(0)
    expect(body.facets.damage).toBe(0)
  })

  it('defaults to EVERY task when no tab is given — the operator rigId read must not lose schedules', async () => {
    await seedForty()
    const res = await listMaintenance(get('/api/maintenance?pageSize=100'))
    const body = await res.json()
    expect(body.total).toBe(40)
    expect(body.data.length).toBe(40)
  })

  it('an unrecognised tab is treated as no filter rather than as an empty list', async () => {
    await seedForty()
    const res = await listMaintenance(get('/api/maintenance?tab=nonsense&pageSize=100'))
    expect((await res.json()).total).toBe(40)
  })

  it('soft-deleted tasks are in neither the rows nor the facet counts', async () => {
    const t = await prisma.maintenanceTask.create({
      data: { vehicleId: vehicle.id, taskName: 'misfiled', intervalType: 'DAYS', intervalValue: 30, status: 'UPCOMING', isDamageReport: true },
    })
    await prisma.maintenanceTask.update({ where: { id: t.id }, data: { deletedAt: new Date() } })
    const res = await listMaintenance(get('/api/maintenance?tab=damage'))
    const body = await res.json()
    expect(body.total).toBe(0)
    expect(body.facets.damage).toBe(0)
  })

  it('reports `truncated` while there are more pages, and not on the last one', async () => {
    await seedForty()
    const first = await (await listMaintenance(get('/api/maintenance?pageSize=25'))).json()
    expect(first.data.length).toBe(25)
    expect(first.truncated).toBe(true)

    const second = await (await listMaintenance(get('/api/maintenance?page=2&pageSize=25'))).json()
    expect(second.data.length).toBe(15)
    expect(second.truncated).toBe(false)
  })

  it('pages stably when rows share a status and a due date (L-13 tiebreaker)', async () => {
    // Same status, same nextDue, same name: without the `{ id: "asc" }` tail the
    // database is free to order them differently per query, so one row is skipped
    // and another shown twice.
    const due = new Date('2026-11-01T00:00:00Z')
    for (let i = 0; i < 30; i++) {
      await prisma.maintenanceTask.create({
        data: { vehicleId: vehicle.id, taskName: 'Grease fittings', intervalType: 'DAYS', intervalValue: 30, status: 'UPCOMING', nextDue: due },
      })
    }
    const seen: string[] = []
    for (const page of [1, 2, 3]) {
      const body = await (await listMaintenance(get(`/api/maintenance?page=${page}&pageSize=10`))).json()
      seen.push(...body.data.map((t: { id: string }) => t.id))
    }
    expect(seen.length).toBe(30)
    expect(new Set(seen).size).toBe(30)
  })
})

describe('GET /api/maintenance/[id] (PR-1a — the alert deep-link target)', () => {
  let admin: Awaited<ReturnType<typeof createAdminUser>>
  let vehicle: Awaited<ReturnType<typeof createVehicle>>

  beforeEach(async () => {
    admin = await createAdminUser()
    mockSession = adminSession(admin.id)
    vehicle = await createVehicle()
  })

  const makeTask = (over: Record<string, unknown> = {}) =>
    prisma.maintenanceTask.create({
      data: {
        vehicleId: vehicle.id, taskName: 'Cracked auger flight', intervalType: 'DAYS', intervalValue: 30,
        status: 'IN_PROGRESS', isDamageReport: true, estimatedCost: 250, actualCost: 199.5, ...over,
      } as never,
    })

  const call = (id: string) =>
    getMaintenance(get(`/api/maintenance/${id}`), { params: Promise.resolve({ id }) })

  it('returns the task with its subject refs resolved', async () => {
    const t = await makeTask()
    const res = await call(t.id)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.id).toBe(t.id)
    expect(data.taskName).toBe('Cracked auger flight')
    expect(data.vehicle).toMatchObject({ id: vehicle.id })
  })

  it('resolves the scalar rig/reporter FKs the list route also resolves', async () => {
    const reporter = await createOperator()
    const t = await makeTask({ reportedById: reporter.id })
    const { data } = await (await call(t.id)).json()
    expect(data.reportedBy).toMatchObject({ id: reporter.id, name: reporter.name })
    expect(data.rig).toBeNull()
  })

  it('404s for a task that does not exist', async () => {
    expect((await call('no-such-task')).status).toBe(404)
  })

  it('404s for a soft-deleted task — a deleted report must read as gone, not open a ghost', async () => {
    const t = await makeTask()
    await prisma.maintenanceTask.update({ where: { id: t.id }, data: { deletedAt: new Date() } })
    expect((await call(t.id)).status).toBe(404)
  })

  it('strips the cost fields for an operator, as the list route does', async () => {
    const operator = await createOperator()
    const t = await makeTask()
    mockSession = { userId: operator.id, role: 'OPERATOR' }
    const { data } = await (await call(t.id)).json()
    expect(data.id).toBe(t.id)
    expect(data).not.toHaveProperty('estimatedCost')
    expect(data).not.toHaveProperty('actualCost')
  })

  it('401s without a session', async () => {
    const t = await makeTask()
    mockSession = null
    expect((await call(t.id)).status).toBe(401)
  })
})
