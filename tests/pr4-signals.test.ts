// PR-4 (D-i · D-j): notifications read on resolve, the dispatcher fix, the
// activeKey migration, and email outcomes — against a real DB.
// Node DB suite (CI-only here). The Resend SDK is stubbed; EMAIL_SANDBOX is set per case.
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '../src/lib/prisma'
import { createAlert, resolveAlertsFor, resolveActiveAlert } from '../src/lib/alerts'
import { dispatchPendingAlerts } from '../src/lib/notifications'
import { sendEmail, tryEmail } from '../src/lib/email/resend'
import { createAdminUser, createOperator } from './helpers/fixtures'

const send = vi.hoisted(() => vi.fn(async () => ({ data: { id: 'provider-1' }, error: null as null | { message: string } })))
vi.mock('resend', () => ({ Resend: class { emails = { send } } }))

afterEach(() => { vi.unstubAllEnvs(); send.mockClear() })

describe('a notification is read when its alert resolves (P-8)', () => {
  it('resolveAlertsFor and resolveActiveAlert mark the alert\'s bell rows read', async () => {
    const admin = await createAdminUser()
    const a = await createAlert('LOW_INVENTORY', 'inventory_items', 'i1:h1', {})
    const b = await createAlert('PIN_LOCKED', 'users', 'u1', {})
    await prisma.notification.createMany({
      data: [
        { userId: admin.id, type: 'LOW_INVENTORY', title: 'x', alertId: a.id },
        { userId: admin.id, type: 'PIN_LOCKED', title: 'y', alertId: b.id },
      ],
    })
    await resolveAlertsFor('inventory_items', 'i1:h1')
    await resolveActiveAlert('PIN_LOCKED', 'users', 'u1')
    const rows = await prisma.notification.findMany({ where: { userId: admin.id } })
    expect(rows.every((n) => n.readAt !== null)).toBe(true)
    expect(await prisma.alert.count({ where: { resolved: false } })).toBe(0)
  })

  it('a transfer\'s alert-less request notification is matched by its link — exactly', async () => {
    const op = await createOperator()
    await prisma.notification.createMany({
      data: [
        { userId: op.id, type: 'TRANSFER_REQUESTED', title: 't1', link: '/operator/my-deployment?transfer=T1' },
        { userId: op.id, type: 'TRANSFER_REQUESTED', title: 't2', link: '/operator/my-deployment?transfer=T2' },
      ],
    })
    await resolveAlertsFor('transfer_requests', 'T1')
    const t1 = await prisma.notification.findFirst({ where: { title: 't1' } })
    const t2 = await prisma.notification.findFirst({ where: { title: 't2' } })
    expect(t1?.readAt).not.toBeNull()
    expect(t2?.readAt).toBeNull()
  })
})

describe('dispatcher (P-2, P-14)', () => {
  beforeEach(() => { vi.stubEnv('EMAIL_SANDBOX', '1') })
  // tests/setup.ts does not reset notification_config — leave no disabled type behind.
  afterEach(async () => {
    await prisma.$executeRaw`UPDATE "notification_config" SET "disabledAlertTypes" = '' WHERE "id" = 'global'`
  })

  it('a disabled type with 120 un-notified alerts does not starve an enabled one', async () => {
    await createAdminUser()
    await prisma.$executeRaw`
      INSERT INTO "notification_config" ("id", "disabledAlertTypes") VALUES ('global', 'LOW_INVENTORY')
      ON CONFLICT ("id") DO UPDATE SET "disabledAlertTypes" = 'LOW_INVENTORY'`
    for (let i = 0; i < 120; i++) await createAlert('LOW_INVENTORY', 'inventory_items', `item${i}:hub`, {})
    const pin = await createAlert('PIN_LOCKED', 'users', 'locked-user', { name: 'Op' })

    await dispatchPendingAlerts()
    expect((await prisma.alert.findUnique({ where: { id: pin.id } }))?.notifiedAt).not.toBeNull()
    expect(await prisma.notification.count({ where: { alertId: pin.id } })).toBe(1)
    expect(await prisma.alert.count({ where: { type: 'LOW_INVENTORY', notifiedAt: { not: null } } })).toBe(0)
  })

  it('create-then-claim is idempotent: a second run creates nothing and re-sends nothing', async () => {
    await createAdminUser({ email: 'a1@test.example' })
    await createAdminUser({ email: 'a2@test.example' })
    const a = await createAlert('PIN_LOCKED', 'users', 'u-idem', { name: 'Op' })
    const first = await dispatchPendingAlerts()
    const second = await dispatchPendingAlerts()
    expect(first.notifications).toBe(2)
    expect(second.alerts).toBe(0)
    expect(await prisma.notification.count({ where: { alertId: a.id } })).toBe(2)
  })
})

describe('email outcomes (D-j · P-1 · P-13)', () => {
  it('sandbox with a redirect inbox → REDIRECTED, logged with deliveredTo (not SENT to the recipient)', async () => {
    vi.stubEnv('EMAIL_SANDBOX', '1')
    vi.stubEnv('EMAIL_SANDBOX_TO', 'sandbox@test.example')
    vi.stubEnv('RESEND_API_KEY', 're_test')
    const r = await sendEmail({ to: 'shop@real.example', subject: 'Work order', html: '<p/>', kind: 'WORK_ORDER' })
    expect(r).toMatchObject({ outcome: 'REDIRECTED', deliveredTo: 'sandbox@test.example' })
    const row = await prisma.emailLog.findUnique({ where: { id: r.logId! } })
    expect(row?.status).toBe('REDIRECTED')
    expect(row?.deliveredTo).toBe('sandbox@test.example')
    expect(row?.to).toBe('shop@real.example')
  })

  it('sandbox with no redirect inbox → SKIPPED (reason SANDBOX); no address → SKIPPED (NO_RECIPIENT) without trying', async () => {
    vi.stubEnv('EMAIL_SANDBOX', '1')
    vi.stubEnv('EMAIL_SANDBOX_TO', '')
    const r = await sendEmail({ to: 'hub@real.example', subject: 'Hub link', html: '<p/>' })
    expect(r).toMatchObject({ outcome: 'SKIPPED', skipReason: 'SANDBOX', deliveredTo: null })
    expect((await prisma.emailLog.findUnique({ where: { id: r.logId! } }))?.status).toBe('SKIPPED')
    expect(await tryEmail({ to: null, subject: 's', html: '<p/>' })).toEqual({ outcome: 'SKIPPED', deliveredTo: null, skipReason: 'NO_RECIPIENT' })
  })

  it('every attempt failing → sendEmail throws (FAILED row); tryEmail reports FAILED', async () => {
    vi.stubEnv('EMAIL_SANDBOX', '')
    vi.stubEnv('RESEND_API_KEY', 're_test')
    send.mockResolvedValue({ data: null as never, error: { message: 'down' } })
    await expect(sendEmail({ to: 'x@real.example', subject: 'Invite', html: '<p/>', kind: 'INVITE' })).rejects.toThrow()
    expect(await prisma.emailLog.count({ where: { status: 'FAILED', to: 'x@real.example' } })).toBe(1)
    expect((await tryEmail({ to: 'x@real.example', subject: 'Invite', html: '<p/>' })).outcome).toBe('FAILED')
    send.mockResolvedValue({ data: { id: 'provider-1' }, error: null })
  }, 20_000)

  it('a resend with retryOf resolves that row\'s EMAIL_FAILED alert on success (recovery by log id)', async () => {
    vi.stubEnv('EMAIL_SANDBOX', '')
    vi.stubEnv('RESEND_API_KEY', 're_test')
    const failed = await prisma.emailLog.create({ data: { to: 'h@real.example', subject: 'Hub link', kind: 'RESERVATION', status: 'FAILED', attempts: 3 } })
    await createAlert('EMAIL_FAILED', 'email_logs', failed.id, {})
    const r = await sendEmail({ to: 'h@real.example', subject: 'Hub link', html: '<p/>', kind: 'RESERVATION', retryOf: failed.id })
    expect(r.outcome).toBe('SENT')
    expect(await prisma.alert.count({ where: { sourceId: failed.id, resolved: false } })).toBe(0)
  })
})

// ── The migration (D-i) ────────────────────────────────────────────────────────
// CI builds the test DB with `prisma db push`, so the CHECK does not exist there and
// the email columns already do. Execute the migration's statements (0)–(4) against
// fixtures that hold every violation shape and a duplicate pair, assert the end
// state, and prove the constraint now refuses a violating row.
const MIGRATION = path.resolve(__dirname, '../prisma/migrations/20261009120000_pr4_alert_active_key_check_email_outcome/migration.sql')
function statements(sql: string): string[] {
  return sql
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    .split(';').map((s) => s.trim()).filter(Boolean)
}

describe('migration: activeKey ⇔ unresolved (D-i)', () => {
  afterAll(async () => {
    await prisma.$executeRawUnsafe('ALTER TABLE "alerts" DROP CONSTRAINT IF EXISTS "alerts_active_key_matches_resolved"')
  })

  it('statements (0)–(4) normalise every shape, then the CHECK holds', async () => {
    const sql = statements(readFileSync(MIGRATION, 'utf8'))
    expect(sql).toHaveLength(7)
    expect(sql[4]).toMatch(/ADD CONSTRAINT "alerts_active_key_matches_resolved"/)

    const noSource = await prisma.alert.create({ data: { type: 'PIN_LOCKED', sourceTable: null, sourceId: null, resolved: false } })
    const resolvedWithKey = await prisma.alert.create({ data: { type: 'PIN_LOCKED', sourceTable: 'users', sourceId: 'r1', resolved: true, activeKey: 'PIN_LOCKED:users:r1' } })
    const missingKey = await prisma.alert.create({ data: { type: 'PIN_LOCKED', sourceTable: 'users', sourceId: 'm1', resolved: false } })
    const older = await prisma.alert.create({ data: { type: 'LOW_INVENTORY', sourceTable: 'inventory_items', sourceId: 'd:1', resolved: false, triggeredAt: new Date(Date.now() - 60_000) } })
    const newer = await prisma.alert.create({ data: { type: 'LOW_INVENTORY', sourceTable: 'inventory_items', sourceId: 'd:1', resolved: false } })

    for (const stmt of sql.slice(0, 5)) await prisma.$executeRawUnsafe(stmt)

    const get = (id: string) => prisma.alert.findUniqueOrThrow({ where: { id } })
    expect(await get(noSource.id)).toMatchObject({ resolved: true, activeKey: null })
    expect(await get(resolvedWithKey.id)).toMatchObject({ resolved: true, activeKey: null })
    expect(await get(missingKey.id)).toMatchObject({ resolved: false, activeKey: 'PIN_LOCKED:users:m1' })
    expect(await get(older.id)).toMatchObject({ resolved: true, activeKey: null })
    expect(await get(newer.id)).toMatchObject({ resolved: false, activeKey: 'LOW_INVENTORY:inventory_items:d:1' })

    await expect(prisma.alert.create({ data: { type: 'PIN_LOCKED', sourceTable: 'users', sourceId: 'bad', resolved: false } })).rejects.toThrow()
  })
})
