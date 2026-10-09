// PR-4 (D-i): each evaluator's pure half — live / evaluate / metadata — over plain
// entities. No database is touched (the module imports the Prisma client but these
// functions never call it).
import { describe, it, expect } from 'vitest'
import {
  dailyCheckMissed, equipmentNotReturned, evalContext, insuranceExpiring, lowInventory,
  maintenanceOverdue, pinLocked, registrationExpiring, STALE_DAMAGE_DAYS,
} from '../src/lib/alert-evaluators'
import { LOCK_DURATION_MS } from '../src/lib/auth/pin'
import { SELF_CLEARING_ALERT_TYPES } from '../src/lib/alert-display'

const DAY = 86_400_000
const now = new Date('2026-10-09T23:30:00Z') // 18:30 Chicago — past the 18:00 cutoff
const ctx = evalContext(now, '18:00')
const morning = evalContext(new Date('2026-10-09T14:00:00Z'), '18:00') // 09:00 Chicago

describe('MAINTENANCE_OVERDUE', () => {
  const task = (over: Partial<Parameters<typeof maintenanceOverdue.evaluate>[0]>) => ({
    id: 't', taskName: 'Oil', status: 'OVERDUE', isDamageReport: false, deletedAt: null,
    nextDue: new Date(now.getTime() - 3 * DAY), updatedAt: now, itemName: 'Truck', ...over,
  })
  it('scheduled: OVERDUE holds (calendar or mileage), rolled forward clears', () => {
    expect(maintenanceOverdue.evaluate(task({}), ctx)).toBe('RAISE')
    expect(maintenanceOverdue.evaluate(task({ status: 'UPCOMING' }), ctx)).toBe('CLEAR')
    expect(maintenanceOverdue.metadata(task({}), ctx)).toMatchObject({ daysPastDue: 3, taskName: 'Oil', itemName: 'Truck' })
  })
  it('damage: stale 7+ days holds, a recent edit clears', () => {
    const stale = task({ isDamageReport: true, status: 'IN_PROGRESS', updatedAt: new Date(now.getTime() - (STALE_DAMAGE_DAYS + 1) * DAY) })
    expect(maintenanceOverdue.evaluate(stale, ctx)).toBe('RAISE')
    expect(maintenanceOverdue.metadata(stale, ctx)).toMatchObject({ staleDamageDays: 8 })
    expect(maintenanceOverdue.evaluate(task({ isDamageReport: true, status: 'IN_PROGRESS', updatedAt: now }), ctx)).toBe('CLEAR')
  })
  it('a completed or deleted task has left the population', () => {
    expect(maintenanceOverdue.live(task({ status: 'COMPLETED' }), ctx)).toBe(false)
    expect(maintenanceOverdue.live(task({ deletedAt: now }), ctx)).toBe(false)
    expect(maintenanceOverdue.live(task({}), ctx)).toBe(true)
  })
})

describe('LOW_INVENTORY', () => {
  it('raises at or below the threshold, clears above; per-hub metadata keeps the hub', () => {
    const row = { key: 'i:h', itemName: 'Bags', hubName: 'Home Lab', hubId: 'h', quantity: 2, threshold: 2 }
    expect(lowInventory.evaluate(row, ctx)).toBe('RAISE')
    expect(lowInventory.evaluate({ ...row, quantity: 3 }, ctx)).toBe('CLEAR')
    expect(lowInventory.metadata(row, ctx)).toMatchObject({ hubName: 'Home Lab', quantity: 2, threshold: 2 })
    expect(lowInventory.source(row)).toBe('i:h')
  })
})

describe('INSURANCE / REGISTRATION expiring', () => {
  const v = (over = {}) => ({ id: 'v', name: 'Truck-01', status: 'ACTIVE', deletedAt: null, insuranceExpires: new Date(now.getTime() + 10 * DAY), registrationExpires: new Date(now.getTime() + 90 * DAY), ...over })
  it('within 30 days raises; beyond clears; a retired or deleted vehicle is out of the population', () => {
    expect(insuranceExpiring.evaluate(v(), ctx)).toBe('RAISE')
    expect(registrationExpiring.evaluate(v(), ctx)).toBe('CLEAR')
    expect(insuranceExpiring.live(v({ status: 'RETIRED' }), ctx)).toBe(false)
    expect(insuranceExpiring.live(v({ deletedAt: now }), ctx)).toBe(false)
    expect(insuranceExpiring.metadata(v(), ctx)).toMatchObject({ itemName: 'Truck-01' })
  })
})

describe('DAILY_CHECK_MISSED', () => {
  const op = (over = {}) => ({ operatorId: 'o', operatorName: 'Field Op 1', isAdminHeld: false, primaryOnActiveRig: true, checkedToday: false, ...over })
  it('after the cutoff with no check → RAISE; before it → HOLD (not cleared every morning); checked in → CLEAR', () => {
    expect(dailyCheckMissed.evaluate(op(), ctx)).toBe('RAISE')
    expect(dailyCheckMissed.evaluate(op(), morning)).toBe('HOLD')
    expect(dailyCheckMissed.evaluate(op({ checkedToday: true }), ctx)).toBe('CLEAR')
  })
  it('not the PRIMARY on an active rig (ended / handed off) → out of the population (P-3)', () => {
    expect(dailyCheckMissed.live(op({ primaryOnActiveRig: false }), ctx)).toBe(false)
  })
  it('keeps D3\'s isAdminHeld flag in the metadata', () => {
    expect(dailyCheckMissed.metadata(op({ isAdminHeld: true }), ctx)).toMatchObject({ isAdminHeld: true, operatorName: 'Field Op 1', cutoff: '18:00', date: ctx.today })
  })
})

describe('EQUIPMENT_NOT_RETURNED', () => {
  const k = (over = {}) => ({ id: 'k', itemName: 'Corer', rigId: 'r', startedAt: new Date(now.getTime() - 100 * DAY), live: true, ...over })
  it('out 90+ days raises; any removal (not live) leaves the population (P-5)', () => {
    expect(equipmentNotReturned.evaluate(k(), ctx)).toBe('RAISE')
    expect(equipmentNotReturned.evaluate(k({ startedAt: new Date(now.getTime() - 10 * DAY) }), ctx)).toBe('CLEAR')
    expect(equipmentNotReturned.live(k({ live: false }), ctx)).toBe(false)
    expect(equipmentNotReturned.metadata(k(), ctx)).toMatchObject({ daysSinceCheckout: 100 })
  })
})

describe('PIN_LOCKED', () => {
  it('live only while the lock is in force (P-6)', () => {
    const u = (lockedAgoMs: number | null) => ({ id: 'u', name: 'Op', email: 'o@x', pinLockedAt: lockedAgoMs === null ? null : new Date(now.getTime() - lockedAgoMs) })
    expect(pinLocked.live(u(60_000), ctx)).toBe(true)
    expect(pinLocked.live(u(LOCK_DURATION_MS + 1), ctx)).toBe(false)
    expect(pinLocked.live(u(null), ctx)).toBe(false)
    expect(pinLocked.metadata(u(60_000), ctx)).toEqual({ name: 'Op', email: 'o@x' })
  })
})

describe('the UI\'s self-clearing list covers every evaluator type', () => {
  it('Resolve is hidden for exactly the evaluator-owned types (EMAIL_FAILED stays dismissable)', () => {
    for (const t of ['MAINTENANCE_OVERDUE', 'LOW_INVENTORY', 'INSURANCE_EXPIRING', 'REGISTRATION_EXPIRING', 'DAILY_CHECK_MISSED', 'EQUIPMENT_NOT_RETURNED', 'PIN_LOCKED', 'INVENTORY_DRIFT', 'CRON_SILENT']) {
      expect(SELF_CLEARING_ALERT_TYPES.has(t)).toBe(true)
    }
    for (const t of ['DAMAGE_REPORTED', 'MATERIAL_REQUEST', 'DAILY_CHECK_FAILED', 'EMAIL_FAILED']) {
      expect(SELF_CLEARING_ALERT_TYPES.has(t)).toBe(false)
    }
  })
})
