// PR-4 (D-i · P-3..P-6): each evaluator-owned type is raised by the cron while its
// condition holds, and CLEARED when its entity leaves the population — the alerts
// that used to freeze. Node DB suite (CI-only here). EMAIL_SANDBOX=1; the dispatcher
// is stubbed so no alert costs a send attempt.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '../src/lib/prisma'
import { GET as cronDispatch } from '../src/app/api/cron/dispatch/route'
import { createAlert } from '../src/lib/alerts'
import { createCategory, createHub, createInventoryItem, createOperator, createRig, createVehicle, seedInventoryStock } from './helpers/fixtures'

vi.mock('../src/lib/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/notifications')>()),
  dispatchPendingAlerts: vi.fn().mockResolvedValue({ alerts: 0, notifications: 0, emailed: false }),
}))

const DAY = 86_400_000
const cron = () => cronDispatch(new NextRequest('http://localhost/api/cron/dispatch', { headers: { authorization: 'Bearer test-cron-secret' } }))
const active = (type: string, sourceId: string) => prisma.alert.count({ where: { type: type as never, sourceId, resolved: false } })

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret'
  vi.stubEnv('EMAIL_SANDBOX', '1')
})
afterEach(() => { vi.unstubAllEnvs() })

describe('evaluators clear on population exit', () => {
  it('INSURANCE_EXPIRING: raised for a live vehicle, cleared when it is retired (P-3/P-4)', async () => {
    const v = await createVehicle()
    await prisma.vehicle.update({ where: { id: v.id }, data: { insuranceExpires: new Date(Date.now() + 5 * DAY) } })
    await cron()
    expect(await active('INSURANCE_EXPIRING', v.id)).toBe(1)
    await prisma.vehicle.update({ where: { id: v.id }, data: { status: 'RETIRED' } })
    await cron()
    expect(await active('INSURANCE_EXPIRING', v.id)).toBe(0)
  })

  it('DAILY_CHECK_MISSED: cleared when the operator\'s rig has ended (P-3)', async () => {
    const op = await createOperator()
    const { rig } = await createRig(op.id)
    await createAlert('DAILY_CHECK_MISSED', 'operators', op.id, { operatorName: 'x' })
    await prisma.rig.update({ where: { id: rig.id }, data: { endedAt: new Date() } })
    await cron()
    expect(await active('DAILY_CHECK_MISSED', op.id)).toBe(0)
  })

  it('EQUIPMENT_NOT_RETURNED: raised by the cron for a line out 90+ days, cleared when it is removed (P-5)', async () => {
    const op = await createOperator()
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id)
    const { rig, kit } = await createRig(op.id)
    await prisma.rig.update({ where: { id: rig.id }, data: { startedAt: new Date(Date.now() - 100 * DAY) } })
    const ki = await prisma.kitItem.create({ data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1 } })
    await cron()
    expect(await active('EQUIPMENT_NOT_RETURNED', ki.id)).toBe(1)
    await prisma.kitItem.update({ where: { id: ki.id }, data: { removedAt: new Date() } })
    await cron()
    expect(await active('EQUIPMENT_NOT_RETURNED', ki.id)).toBe(0)
  })

  it('PIN_LOCKED: held while the lock is in force, cleared when it lapses (P-6)', async () => {
    const op = await createOperator()
    await prisma.user.update({ where: { id: op.id }, data: { pinLockedAt: new Date() } })
    await cron()
    expect(await active('PIN_LOCKED', op.id)).toBe(1)
    await prisma.user.update({ where: { id: op.id }, data: { pinLockedAt: new Date(Date.now() - 20 * 60_000) } })
    await cron()
    expect(await active('PIN_LOCKED', op.id)).toBe(0)
  })

  it('LOW_INVENTORY: raised per hub, cleared when the item is retired', async () => {
    const cat = await createCategory()
    const hub = await createHub()
    const item = await createInventoryItem(cat.id, { name: 'Bags', quantity: 1 })
    await seedInventoryStock(item.id, hub.id, 1)
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { lowStockThreshold: 3 } })
    await cron()
    expect(await active('LOW_INVENTORY', `${item.id}:${hub.id}`)).toBe(1)
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { status: 'RETIRED' } })
    await cron()
    expect(await active('LOW_INVENTORY', `${item.id}:${hub.id}`)).toBe(0)
  })

  it('MAINTENANCE_OVERDUE: raised for an overdue schedule, cleared when the task is completed', async () => {
    const v = await createVehicle()
    const t = await prisma.maintenanceTask.create({
      data: { taskName: 'Oil', vehicleId: v.id, intervalType: 'DAYS', intervalValue: 30, status: 'UPCOMING', nextDue: new Date(Date.now() - 2 * DAY) },
    })
    await cron()
    expect((await prisma.maintenanceTask.findUnique({ where: { id: t.id } }))?.status).toBe('OVERDUE')
    expect(await active('MAINTENANCE_OVERDUE', t.id)).toBe(1)
    await prisma.maintenanceTask.update({ where: { id: t.id }, data: { status: 'COMPLETED' } })
    await cron()
    expect(await active('MAINTENANCE_OVERDUE', t.id)).toBe(0)
  })

  it('CRON_SILENT is cleared by a run (before dispatch, P-7)', async () => {
    await createAlert('CRON_SILENT', 'system', 'cron-dispatch', { staleMinutes: 45 })
    await cron()
    expect(await active('CRON_SILENT', 'cron-dispatch')).toBe(0)
  })
})
