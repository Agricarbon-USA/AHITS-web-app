import { prisma } from '@/lib/prisma'
import { createAlert, resolveActiveAlert } from '@/lib/alerts'
import { allHubStockForScan, serializedStockForScan } from '@/lib/inventory-stock'
import { getDeploymentRostersForDisplay } from '@/lib/deployment-assignments'
import { businessDateTime } from '@/lib/business-date'
import { LIVE_KIT_ITEM, LIVE_VEHICLE } from '@/lib/populations'
import { LOCK_DURATION_MS } from '@/lib/auth/pin'

/**
 * PR-4 (RC-5 · D-i): an alert exists iff its condition holds for a live entity, and
 * ONE evaluator owns both its raise and its clear.
 *
 * Each evaluator-owned type is a registry entry:
 *   candidates()  — the entities that may need an alert now
 *   load(id)      — the entity behind an ACTIVE alert (null if it is gone)
 *   source(e)     — the alert's sourceId for that entity
 *   live(e)       — is the entity still in the population at all?
 *   evaluate(e)   — RAISE / CLEAR / HOLD (HOLD: leave whatever is there — e.g. a
 *                   missed-check alert before the day's cutoff)
 *   metadata(e)   — what the alert carries (bell + email wording, deep link)
 *
 * The cron runs each over ACTIVE ALERTS ∪ CANDIDATES (`runEvaluator`), so an entity
 * that leaves its population — a retired vehicle, an ended rig, a removed kit line,
 * an expired PIN lock — has its alert cleared on the next pass instead of freezing
 * (P-3 / P-4 / P-5 / P-6). The evaluator predicates are the scans' existing ones,
 * moved here; what is new is the clear on population exit.
 *
 * Not in the loop, on purpose:
 *   • DAMAGE_REPORTED / MATERIAL_REQUEST / DAILY_CHECK_FAILED — event-owned: raised
 *     and cleared by the actions that open and close them (openDamageTask /
 *     closeDamageTask, request transitions, a passing check).
 *   • INVENTORY_DRIFT (INV-1..9) — fixed-key monitors that already raise and clear in
 *     place in the cron each pass.
 *   • CRON_SILENT — raised by the admin read path when the cron is stale, resolved by
 *     the cron itself at the start of dispatch (P-7).
 *   • EMAIL_FAILED — raised by the cron per failed log row; cleared by a successful
 *     resend of that row (`retryOf`, P-13) or by an admin.
 * The client-safe list of types that clear themselves (for hiding the admin Resolve
 * button, P-9) is `SELF_CLEARING_ALERT_TYPES` in `src/lib/alert-display.ts`.
 */

export type Verdict = 'RAISE' | 'CLEAR' | 'HOLD'
type Meta = Record<string, string | number | boolean | null>

export interface Evaluator<E> {
  type: string
  sourceTable: string
  candidates(ctx: EvalContext): Promise<E[]>
  load(sourceId: string, ctx: EvalContext): Promise<E | null>
  source(e: E): string
  live(e: E, ctx: EvalContext): boolean
  evaluate(e: E, ctx: EvalContext): Verdict
  metadata(e: E, ctx: EvalContext): Meta
}

export interface EvalContext {
  now: Date
  /** Business day (America/Chicago) and wall clock, from businessDateTime(). */
  today: string
  pastDailyCheckCutoff: boolean
  dailyCheckCutoff: string
}

export function evalContext(now: Date, dailyCheckCutoff: string): EvalContext {
  const { date: today, hour, minute } = businessDateTime(now)
  const [ch, cm] = dailyCheckCutoff.split(':').map(Number)
  return { now, today, dailyCheckCutoff, pastDailyCheckCutoff: hour > ch || (hour === ch && minute >= cm) }
}

const DAY = 86_400_000

// ── MAINTENANCE_OVERDUE ─────────────────────────────────────────────────────
// Two raises share this type (the calendar/odometer overdue and the stale-damage
// nag, CC-34 3b). A task is in the population while it is open (not deleted, not
// completed); it holds the alert while it is OVERDUE (a scheduled task — calendar
// or mileage, `applyOdometerReading` sets OVERDUE too) or untouched for 7+ days (a
// damage report). Completing/deleting it, rolling it forward, or editing a stale
// repair clears it.
export const STALE_DAMAGE_DAYS = 7
interface TaskE {
  id: string; taskName: string; status: string; isDamageReport: boolean; deletedAt: Date | null
  nextDue: Date | null; updatedAt: Date; itemName: string | null
}
const taskSelect = {
  id: true, taskName: true, status: true, isDamageReport: true, deletedAt: true, nextDue: true, updatedAt: true,
  vehicle: { select: { name: true } }, item: { select: { name: true } },
} as const
type TaskRow = { id: string; taskName: string; status: string; isDamageReport: boolean; deletedAt: Date | null; nextDue: Date | null; updatedAt: Date; vehicle: { name: string } | null; item: { name: string } | null }
const toTask = (t: TaskRow): TaskE => ({ ...t, itemName: t.item?.name ?? t.vehicle?.name ?? null })

export const maintenanceOverdue: Evaluator<TaskE> = {
  type: 'MAINTENANCE_OVERDUE',
  sourceTable: 'maintenance_tasks',
  async candidates(ctx) {
    const scheduled = await prisma.maintenanceTask.findMany({
      where: { isDamageReport: false, deletedAt: null, status: 'OVERDUE' },
      select: taskSelect,
    })
    // The stale-damage raise stays throttled to 5 new nags per pass (CC-34 3b); the
    // clear is not throttled — it runs over every active alert.
    const stale = await prisma.maintenanceTask.findMany({
      where: { isDamageReport: true, deletedAt: null, status: { not: 'COMPLETED' }, updatedAt: { lt: new Date(ctx.now.getTime() - STALE_DAMAGE_DAYS * DAY) } },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 5,
      select: taskSelect,
    })
    return [...scheduled, ...stale].map(toTask)
  },
  async load(id) {
    const t = await prisma.maintenanceTask.findUnique({ where: { id }, select: taskSelect })
    return t ? toTask(t) : null
  },
  source: (t) => t.id,
  live: (t) => t.deletedAt === null && t.status !== 'COMPLETED',
  evaluate(t, ctx) {
    if (!t.isDamageReport) return t.status === 'OVERDUE' ? 'RAISE' : 'CLEAR'
    return t.updatedAt.getTime() < ctx.now.getTime() - STALE_DAMAGE_DAYS * DAY ? 'RAISE' : 'CLEAR'
  },
  metadata(t, ctx): Meta {
    return t.isDamageReport
      ? { taskName: t.taskName, itemName: t.itemName, staleDamageDays: Math.floor((ctx.now.getTime() - t.updatedAt.getTime()) / DAY) }
      : { taskName: t.taskName, itemName: t.itemName, daysPastDue: t.nextDue ? Math.max(0, Math.floor((ctx.now.getTime() - t.nextDue.getTime()) / DAY)) : 0 }
  },
}

// ── LOW_INVENTORY ───────────────────────────────────────────────────────────
// PR-2's one meaning: consumables per active hub (on hand ≤ threshold, key
// `<item>:<hub>`), serialized pickable units across hubs (key `<item>:serialized`).
// The scan rows ARE the population (live items with a threshold, active hubs), so an
// active alert whose key is not among them — item retired or deleted, hub
// deactivated, threshold removed — has left it and is cleared.
interface StockE { key: string; itemName: string | null; hubName?: string | null; hubId?: string; quantity: number; threshold: number }
export const lowInventory: Evaluator<StockE> = {
  type: 'LOW_INVENTORY',
  sourceTable: 'inventory_items',
  async candidates() {
    const hub = (await allHubStockForScan()).map((r) => ({
      key: `${r.itemId}:${r.hubId}`, itemName: r.itemName, hubName: r.hubName, hubId: r.hubId, quantity: r.quantity, threshold: r.threshold,
    }))
    const ser = (await serializedStockForScan()).map((r) => ({
      key: `${r.itemId}:serialized`, itemName: r.itemName, quantity: r.pickable, threshold: r.threshold,
    }))
    return [...hub, ...ser]
  },
  async load() { return null }, // not among this pass's scan rows ⇒ out of the population
  source: (e) => e.key,
  live: () => true,
  evaluate: (e) => (e.quantity <= e.threshold ? 'RAISE' : 'CLEAR'),
  metadata: (e): Meta => (e.hubId
    ? { itemName: e.itemName, hubName: e.hubName ?? null, hubId: e.hubId, quantity: e.quantity, threshold: e.threshold }
    : { itemName: e.itemName, quantity: e.quantity, threshold: e.threshold }),
}

// ── INSURANCE_EXPIRING / REGISTRATION_EXPIRING ──────────────────────────────
// Live vehicles (LIVE_VEHICLE) whose document expires within 30 days (or already
// has). A retired or deleted vehicle has left the population (P-3/P-4).
export const EXPIRY_WINDOW_DAYS = 30
interface VehicleE { id: string; name: string; status: string; deletedAt: Date | null; insuranceExpires: Date | null; registrationExpires: Date | null }
const vehicleSelect = { id: true, name: true, status: true, deletedAt: true, insuranceExpires: true, registrationExpires: true } as const
function expiryEvaluator(type: 'INSURANCE_EXPIRING' | 'REGISTRATION_EXPIRING', field: 'insuranceExpires' | 'registrationExpires'): Evaluator<VehicleE> {
  return {
    type,
    sourceTable: 'vehicles',
    candidates: () => prisma.vehicle.findMany({ where: LIVE_VEHICLE, select: vehicleSelect }),
    load: (id) => prisma.vehicle.findUnique({ where: { id }, select: vehicleSelect }),
    source: (v) => v.id,
    live: (v) => v.deletedAt === null && v.status !== 'RETIRED',
    evaluate: (v, ctx) => (v[field] && v[field]!.getTime() <= ctx.now.getTime() + EXPIRY_WINDOW_DAYS * DAY ? 'RAISE' : 'CLEAR'),
    metadata: (v) => ({ itemName: v.name, expiresAt: v[field]?.toISOString() ?? null }),
  }
}
export const insuranceExpiring = expiryEvaluator('INSURANCE_EXPIRING', 'insuranceExpires')
export const registrationExpiring = expiryEvaluator('REGISTRATION_EXPIRING', 'registrationExpires')

// ── DAILY_CHECK_MISSED ──────────────────────────────────────────────────────
// Population: operators who are the PRIMARY on an active deployment. Raised after the
// day's cutoff when they have no check for the business day; cleared when they check
// in — or when they stop being the PRIMARY on an active rig (the rig ended or was
// handed off, P-3). Before the cutoff an existing alert is left as it is (HOLD) so it
// isn't cleared every morning and re-belled every afternoon. `isAdminHeld` (D3) is
// kept exactly as before.
interface OperatorE { operatorId: string; operatorName: string; isAdminHeld: boolean; primaryOnActiveRig: boolean; checkedToday: boolean }
async function operatorEntities(rigIds: string[], ctx: EvalContext): Promise<OperatorE[]> {
  const rosters = await getDeploymentRostersForDisplay(rigIds)
  const out: OperatorE[] = []
  for (const rigId of rigIds) {
    const roster = rosters.get(rigId)
    const operatorId = roster?.operatorId ?? null
    if (!operatorId) continue
    const checked = await prisma.dailyCheck.findFirst({ where: { operatorId, date: new Date(ctx.today) }, select: { id: true } })
    out.push({
      operatorId,
      operatorName: roster?.operator?.name ?? 'Operator',
      isAdminHeld: roster?.operator?.role === 'ADMIN',
      primaryOnActiveRig: true,
      checkedToday: !!checked,
    })
  }
  return out
}
export const dailyCheckMissed: Evaluator<OperatorE> = {
  type: 'DAILY_CHECK_MISSED',
  sourceTable: 'operators',
  async candidates(ctx) {
    const rigs = await prisma.rig.findMany({ where: { endedAt: null }, select: { id: true } })
    return operatorEntities(rigs.map((r) => r.id), ctx)
  },
  async load(operatorId, ctx) {
    const asPrimary = await prisma.deploymentAssignment.findMany({ where: { operatorId, role: 'PRIMARY', endedAt: null }, select: { rigId: true } })
    const active = await prisma.rig.findMany({ where: { id: { in: asPrimary.map((a) => a.rigId) }, endedAt: null }, select: { id: true } })
    const found = await operatorEntities(active.map((r) => r.id), ctx)
    return found.find((e) => e.operatorId === operatorId) ?? {
      operatorId, operatorName: 'Operator', isAdminHeld: false, primaryOnActiveRig: false, checkedToday: false,
    }
  },
  source: (e) => e.operatorId,
  live: (e) => e.primaryOnActiveRig,
  evaluate: (e, ctx) => (e.checkedToday ? 'CLEAR' : ctx.pastDailyCheckCutoff ? 'RAISE' : 'HOLD'),
  metadata: (e, ctx) => ({ operatorName: e.operatorName, date: ctx.today, cutoff: ctx.dailyCheckCutoff, isAdminHeld: e.isAdminHeld }),
}

// ── EQUIPMENT_NOT_RETURNED ──────────────────────────────────────────────────
// A kit line still live (LIVE_KIT_ITEM) on a deployment started 90+ days ago. Any
// removal path — return, end, transfer, retire — takes it out of the population, so
// the alert clears on the next pass (P-5; it used to clear only on end). The cron now
// raises it too, not only the daily-check submission.
export const NOT_RETURNED_DAYS = 90
interface KitLineE { id: string; itemName: string; rigId: string; startedAt: Date; live: boolean }
const kitSelect = { id: true, removedAt: true, item: { select: { name: true } }, kit: { select: { rig: { select: { id: true, startedAt: true, endedAt: true } } } } } as const
type KitRow = { id: string; removedAt: Date | null; item: { name: string }; kit: { rig: { id: string; startedAt: Date; endedAt: Date | null } | null } }
const toKitLine = (k: KitRow): KitLineE | null => k.kit.rig
  ? { id: k.id, itemName: k.item.name, rigId: k.kit.rig.id, startedAt: k.kit.rig.startedAt, live: k.removedAt === null && k.kit.rig.endedAt === null }
  : null
export const equipmentNotReturned: Evaluator<KitLineE> = {
  type: 'EQUIPMENT_NOT_RETURNED',
  sourceTable: 'kit_items',
  async candidates(ctx) {
    const rows = await prisma.kitItem.findMany({
      where: { ...LIVE_KIT_ITEM, kit: { rig: { endedAt: null, startedAt: { lt: new Date(ctx.now.getTime() - NOT_RETURNED_DAYS * DAY) } } } },
      select: kitSelect,
    })
    return rows.map(toKitLine).filter((k): k is KitLineE => k !== null)
  },
  async load(id) {
    const k = await prisma.kitItem.findUnique({ where: { id }, select: kitSelect })
    return k ? toKitLine(k) : null
  },
  source: (k) => k.id,
  live: (k) => k.live,
  evaluate: (k, ctx) => (k.startedAt.getTime() < ctx.now.getTime() - NOT_RETURNED_DAYS * DAY ? 'RAISE' : 'CLEAR'),
  metadata: (k, ctx) => ({ itemName: k.itemName, rigId: k.rigId, daysSinceCheckout: Math.floor((ctx.now.getTime() - k.startedAt.getTime()) / DAY) }),
}

// ── PIN_LOCKED ──────────────────────────────────────────────────────────────
// A user whose PIN lock is still in force (locked within the last LOCK_DURATION_MS).
// The lock lapses on its own after 15 minutes — and the alert with it (P-6); an
// admin unlock or reset clears it at once (users/[id] PATCH).
interface UserE { id: string; name: string; email: string; pinLockedAt: Date | null }
const userSelect = { id: true, name: true, email: true, pinLockedAt: true } as const
export const pinLocked: Evaluator<UserE> = {
  type: 'PIN_LOCKED',
  sourceTable: 'users',
  candidates: (ctx) => prisma.user.findMany({ where: { pinLockedAt: { gt: new Date(ctx.now.getTime() - LOCK_DURATION_MS) } }, select: userSelect }),
  load: (id) => prisma.user.findUnique({ where: { id }, select: userSelect }),
  source: (u) => u.id,
  live: (u, ctx) => !!u.pinLockedAt && ctx.now.getTime() - u.pinLockedAt.getTime() < LOCK_DURATION_MS,
  evaluate: () => 'RAISE',
  metadata: (u) => ({ name: u.name, email: u.email }),
}

export const EVALUATORS: Evaluator<unknown>[] = [
  maintenanceOverdue, lowInventory, insuranceExpiring, registrationExpiring,
  dailyCheckMissed, equipmentNotReturned, pinLocked,
] as Evaluator<unknown>[]

/**
 * Run one evaluator over ACTIVE ALERTS ∪ CANDIDATES. Each id is evaluated once:
 * out of the population (gone or not live) → clear; otherwise its verdict.
 */
export async function runEvaluator<E>(ev: Evaluator<E>, ctx: EvalContext): Promise<{ raised: number; cleared: number }> {
  const candidates = new Map<string, E>()
  for (const e of await ev.candidates(ctx)) candidates.set(ev.source(e), e)
  const active = await prisma.alert.findMany({
    where: { type: ev.type as never, sourceTable: ev.sourceTable, resolved: false },
    select: { sourceId: true },
  })
  const ids = new Set<string>([...candidates.keys(), ...active.map((a) => a.sourceId).filter((s): s is string => !!s)])
  let raised = 0
  let cleared = 0
  for (const id of ids) {
    const e = candidates.get(id) ?? (await ev.load(id, ctx))
    const verdict: Verdict = !e || !ev.live(e, ctx) ? 'CLEAR' : ev.evaluate(e, ctx)
    if (verdict === 'RAISE' && e) {
      await createAlert(ev.type, ev.sourceTable, id, ev.metadata(e, ctx))
      raised++
    } else if (verdict === 'CLEAR') {
      await resolveActiveAlert(ev.type, ev.sourceTable, id)
      cleared++
    }
  }
  return { raised, cleared }
}
