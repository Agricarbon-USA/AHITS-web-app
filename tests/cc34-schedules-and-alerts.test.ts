// CC-34 PR-3: schedules become real + the two new maintenance alerts.
// Node DB suite (CI-only here; no local Postgres). Alerts are REAL (not mocked) so
// 3b's dedup and 3e's "exactly one unresolved READY_TO_FINALIZE" assertions can query
// the alert table directly. Only the notification DISPATCHER is stubbed so the cron
// never attempts to send email.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as createMaintenance } from '../src/app/api/maintenance/route'
import { POST as completeMaintenance } from '../src/app/api/maintenance/[id]/complete/route'
import { GET as cronDispatch } from '../src/app/api/cron/dispatch/route'
import { applyTransition, resolveStatusLinkById, issueStatusLink } from '../src/lib/status-links'
import { prisma } from '../src/lib/prisma'
import {
  createOperator, createAdminUser, createCategory, createInventoryItem,
  createInventoryUnit, createVehicle, createRig, createHub,
  adminSession,
} from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
// Keep presentAlert real; only stub the dispatcher so cron never emails during a test run.
vi.mock('../src/lib/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/notifications')>()),
  dispatchPendingAlerts: vi.fn().mockResolvedValue({ alerts: 0, notifications: 0, emailed: false }),
}))

function jsonReq(url: string, method: string, body: unknown) {
  return new NextRequest(url, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
}

describe('CC-34 PR-3 schedules & alerts', () => {
  let admin: Awaited<ReturnType<typeof createAdminUser>>
  beforeEach(async () => {
    admin = await createAdminUser()
    mockSession = adminSession(admin.id)
  })

  // ── 3a · a schedulable task is never born unschedulable ────────────────────
  it('DAYS task with no nextDue defaults nextDue to now + interval', async () => {
    const vehicle = await createVehicle()
    const res = await createMaintenance(jsonReq('http://localhost/api/maintenance', 'POST', {
      vehicleId: vehicle.id, taskName: 'Wintex: hyd oil check', intervalType: 'DAYS', intervalValue: 90,
    }))
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data.nextDue).toBeTruthy()
    const days = (new Date(data.nextDue).getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(88)
    expect(days).toBeLessThan(92)
  })

  it('MILEAGE task with no nextOdometer defaults to vehicle odometer + interval', async () => {
    const vehicle = await createVehicle()
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { odometer: 12_000 } })
    const res = await createMaintenance(jsonReq('http://localhost/api/maintenance', 'POST', {
      vehicleId: vehicle.id, taskName: 'Grease fittings', intervalType: 'MILEAGE', intervalValue: 500,
    }))
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data.nextOdometer).toBe(12_500)
  })

  // ── 3c · stranded-unit: an in-kit repair closes to CHECKED_OUT, not AVAILABLE ─
  it('completing a repair on a unit still in an active kit restores it to CHECKED_OUT', async () => {
    const op = await createOperator()
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'IN_MAINTENANCE' })
    const hub = await createHub()
    const { kit } = await createRig(op.id)
    await prisma.kitItem.create({ data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id } })
    const task = await prisma.maintenanceTask.create({
      data: { taskName: 'Fix auger', isDamageReport: true, status: 'IN_PROGRESS', itemId: item.id, inventoryUnitId: unit.id },
    })
    const res = await completeMaintenance(
      jsonReq(`http://localhost/api/maintenance/${task.id}/complete`, 'POST', { returnDestinationType: 'HUB', returnDestinationId: hub.id }),
      { params: Promise.resolve({ id: task.id }) },
    )
    expect(res.status).toBe(200)
    const after = await prisma.inventoryUnit.findUnique({ where: { id: unit.id } })
    expect(after?.status).toBe('CHECKED_OUT')
  })

  it('completing a repair on a unit no longer in any kit restores it to AVAILABLE', async () => {
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'IN_MAINTENANCE' })
    const hub = await createHub()
    const task = await prisma.maintenanceTask.create({
      data: { taskName: 'Fix auger', isDamageReport: true, status: 'IN_PROGRESS', itemId: item.id, inventoryUnitId: unit.id },
    })
    const res = await completeMaintenance(
      jsonReq(`http://localhost/api/maintenance/${task.id}/complete`, 'POST', { returnDestinationType: 'HUB', returnDestinationId: hub.id }),
      { params: Promise.resolve({ id: task.id }) },
    )
    expect(res.status).toBe(200)
    const after = await prisma.inventoryUnit.findUnique({ where: { id: unit.id } })
    expect(after?.status).toBe('AVAILABLE')
  })

  // ── 3b · stale-damage nag (cron), deduped, self-resolving ──────────────────
  it('cron flags a stale damage repair once (deduped) and complete resolves it', async () => {
    process.env.CRON_SECRET = 'test-cron-secret'
    const vehicle = await createVehicle()
    const task = await prisma.maintenanceTask.create({
      data: { taskName: 'Stale fix', isDamageReport: true, status: 'IN_PROGRESS', vehicleId: vehicle.id },
    })
    // @updatedAt is Prisma-managed and can't be set on create — force it into the past.
    await prisma.$executeRaw`UPDATE "maintenance_tasks" SET "updatedAt" = NOW() - INTERVAL '8 days' WHERE "id" = ${task.id}`

    const cronReq = () => new NextRequest('http://localhost/api/cron/dispatch', { headers: { Authorization: 'Bearer test-cron-secret' } })
    expect((await cronDispatch(cronReq())).status).toBe(200)
    expect((await cronDispatch(cronReq())).status).toBe(200) // a second pass must not double-raise

    const active = await prisma.alert.findMany({
      where: { type: 'MAINTENANCE_OVERDUE', sourceTable: 'maintenance_tasks', sourceId: task.id, resolved: false },
    })
    expect(active.length).toBe(1)
    expect((active[0].metadata as { staleDamageDays?: number }).staleDamageDays).toBeGreaterThanOrEqual(7)

    // Completing the (vehicle) damage task resolves the nag — no return destination needed.
    const res = await completeMaintenance(
      jsonReq(`http://localhost/api/maintenance/${task.id}/complete`, 'POST', {}),
      { params: Promise.resolve({ id: task.id }) },
    )
    expect(res.status).toBe(200)
    const stillActive = await prisma.alert.findFirst({
      where: { sourceTable: 'maintenance_tasks', sourceId: task.id, resolved: false },
    })
    expect(stillActive).toBeNull()
  })

  // ── 3e · shop WORK_ORDER COMPLETED becomes a real, deduped alert ───────────
  it('a WORK_ORDER COMPLETED transition yields exactly one unresolved READY_TO_FINALIZE alert', async () => {
    const task = await prisma.maintenanceTask.create({
      data: { taskName: 'Shop repair', isDamageReport: true, status: 'IN_PROGRESS' },
    })
    const { statusLink } = await issueStatusLink({ type: 'WORK_ORDER', maintenanceTaskId: task.id, createdById: admin.id })
    const resolved = await resolveStatusLinkById(statusLink.id)
    expect(resolved).toBeTruthy()
    const r = await applyTransition(resolved!, { action: 'COMPLETED', actorLabel: 'Ace Repair' })
    expect(r.ok).toBe(true)

    const alerts = await prisma.alert.findMany({
      where: { type: 'DAMAGE_REPORTED', sourceTable: 'maintenance_tasks', sourceId: task.id, resolved: false },
    })
    expect(alerts.length).toBe(1)
    const meta = alerts[0].metadata as { phase?: string; shop?: string }
    expect(meta.phase).toBe('READY_TO_FINALIZE')
    expect(meta.shop).toBe('Ace Repair')
    expect(alerts[0].notifiedAt).toBeNull() // the dispatcher bells + emails it exactly once
  })
})
