import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '../src/lib/prisma'
import { PATCH as patchTask } from '../src/app/api/maintenance/[id]/route'
import { GET as listVehicles } from '../src/app/api/vehicles/route'
import { DELETE as deleteVehicle } from '../src/app/api/vehicles/[id]/route'
import { POST as restoreVehicle } from '../src/app/api/vehicles/[id]/restore/route'
import { POST as openTask } from '../src/app/api/daily-check/[id]/open-task/route'
import { closeDamageTask, OpenRepairExists } from '../src/lib/maintenance'
import { createAdminUser, createOperator, createVehicle, adminSession, operatorSession } from './helpers/fixtures'

// PR-5b point fixes, server half:
//  - Reopen refuses (409, naming it) when the asset already has another open repair —
//    it used to make two (found in the PR-3a/3b smokes; U-15 "duplicate open-task").
//  - Vehicles get PR-3c's Show deleted → Restore twin: GET ?deleted=1 (admins only)
//    and POST /api/vehicles/[id]/restore, exact (deletedAt cleared, nothing else).
//  - open-task says `created: false` when a failed check joined the open repair.

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
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const damage = (vehicleId: string, status: 'IN_PROGRESS' | 'COMPLETED', taskName = 'Repair') =>
  prisma.maintenanceTask.create({
    data: { taskName, isDamageReport: true, status, vehicleId, ...(status === 'COMPLETED' && { completedAt: new Date() }) },
  })

let admin: { id: string }
beforeEach(async () => {
  admin = await createAdminUser()
  mockSession = adminSession(admin.id)
})

describe('Reopen never makes a second open repair (U-15)', () => {
  it('PATCH back to IN_PROGRESS → 409 naming the open repair; nothing changes', async () => {
    const v = await createVehicle({ status: 'IN_MAINTENANCE' })
    const closed = await damage(v.id, 'COMPLETED', 'Cracked mirror')
    await damage(v.id, 'IN_PROGRESS', 'Flat tyre')

    const res = await patchTask(req(`/api/maintenance/${closed.id}`, 'PATCH', { status: 'IN_PROGRESS' }), params(closed.id))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('"Flat tyre" is already open for this vehicle — add to it or close it before reopening this one.')
    expect((await prisma.maintenanceTask.findUnique({ where: { id: closed.id } }))?.status).toBe('COMPLETED')
  })

  it('with no other open repair, Reopen works as before (U-7)', async () => {
    const v = await createVehicle({ status: 'ACTIVE' })
    const closed = await damage(v.id, 'COMPLETED')
    const res = await patchTask(req(`/api/maintenance/${closed.id}`, 'PATCH', { status: 'IN_PROGRESS' }), params(closed.id))
    expect(res.status).toBe(200)
    expect((await prisma.maintenanceTask.findUnique({ where: { id: closed.id } }))?.status).toBe('IN_PROGRESS')
    expect((await prisma.vehicle.findUnique({ where: { id: v.id } }))?.status).toBe('IN_MAINTENANCE')
  })

  it('the module throws OpenRepairExists (any caller gets the guard, not just the route)', async () => {
    const v = await createVehicle({ status: 'IN_MAINTENANCE' })
    const closed = await damage(v.id, 'COMPLETED')
    await damage(v.id, 'IN_PROGRESS')
    await expect(prisma.$transaction((tx) => closeDamageTask(tx, closed.id, 'REOPEN'))).rejects.toBeInstanceOf(OpenRepairExists)
  })
})

describe('vehicles — Show deleted → Restore', () => {
  it('Delete then Restore is exact; ?deleted=1 lists only deleted, admins only', async () => {
    const v = await createVehicle({ name: 'PR5b Trailer' })
    const live = await createVehicle({ name: 'PR5b Live' })
    expect((await deleteVehicle(req(`/api/vehicles/${v.id}`, 'DELETE'), params(v.id))).status).toBe(200)

    const deletedList = await (await listVehicles(req('/api/vehicles?deleted=1', 'GET'))).json()
    expect(deletedList.data.map((x: { id: string }) => x.id)).toEqual([v.id])
    const liveList = await (await listVehicles(req('/api/vehicles', 'GET'))).json()
    expect(liveList.data.map((x: { id: string }) => x.id)).toEqual([live.id])

    expect((await restoreVehicle(req(`/api/vehicles/${v.id}/restore`, 'POST'), params(v.id))).status).toBe(200)
    const after = await prisma.vehicle.findUnique({ where: { id: v.id } })
    expect(after?.deletedAt).toBeNull()
    expect(after?.name).toBe('PR5b Trailer')
    expect(after?.qrCodeId).toBe(v.qrCodeId)
  })

  it('restoring a vehicle that is not deleted is a 404; operators get 403 on both', async () => {
    const v = await createVehicle()
    expect((await restoreVehicle(req(`/api/vehicles/${v.id}/restore`, 'POST'), params(v.id))).status).toBe(404)
    const op = await createOperator()
    mockSession = operatorSession(op.id)
    expect((await restoreVehicle(req(`/api/vehicles/${v.id}/restore`, 'POST'), params(v.id))).status).toBe(403)
    expect((await listVehicles(req('/api/vehicles?deleted=1', 'GET'))).status).toBe(403)
  })
})

describe('open-task joins the open repair and says so', () => {
  it('a second failed check on a vehicle with an open repair → created: false, still one open repair', async () => {
    const op = await createOperator()
    const v = await createVehicle()
    const check = await prisma.dailyCheck.create({
      data: {
        vehicleId: v.id, operatorId: op.id, date: new Date('2026-10-09'),
        checklistJson: [{ key: 'tires', label: 'Tires', value: 'no', note: 'flat' }], passFail: false, issues: 'Flat tyre',
      },
    })
    await damage(v.id, 'IN_PROGRESS', 'Already open')
    const res = await openTask(req(`/api/daily-check/${check.id}/open-task`, 'POST', {}), params(check.id))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.created).toBe(false)
    const open = await prisma.maintenanceTask.findMany({ where: { vehicleId: v.id, isDamageReport: true, status: { not: 'COMPLETED' } } })
    expect(open).toHaveLength(1)
  })
})
