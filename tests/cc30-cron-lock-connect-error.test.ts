import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { POST as cron } from '../src/app/api/cron/dispatch/route'
import { prisma } from '../src/lib/prisma'

// UXP-3 ride-along (GAP-4 residual, CC-30): the advisory-lock CONNECT-ERROR branch.
// tryAcquireCronLock opens its own PrismaClient on DIRECT_URL (read per call); when that
// connection throws, handleCron must answer 500 {error:'advisory-lock-connect-error'} so
// Cloud Scheduler retries and the failure is visible — NOT the old 200 {skipped} that let
// a dead database read as permanently healthy. Every other cron test drives the 200 path
// (CI sets DIRECT_URL to the test DB, so the lock is genuinely acquired); this is the one
// that points DIRECT_URL at a refused loopback port. The app singleton keeps DATABASE_URL,
// so the afterEach wipes in tests/setup.ts are unaffected.
//
// The CC-30 property under test is two-sided: the status/body, AND that nothing ran —
// cronLastRunAt stays null, so CRON_SILENT stays armed instead of a crashed run stamping
// the heartbeat.

vi.mock('../src/lib/alerts', () => ({
  createAlert: vi.fn().mockResolvedValue({}),
  resolveActiveAlert: vi.fn().mockResolvedValue({}),
  CRON_SILENT_SOURCE_TABLE: 'system',
  CRON_SILENT_SOURCE_ID: 'cron-dispatch',
}))
vi.mock('../src/lib/notifications', () => ({
  dispatchPendingAlerts: vi.fn().mockResolvedValue({ notified: 0 }),
}))
// The route only calls captureException; a minimal mock lets the test assert the
// failure was reported (the whole point of the 500 branch is visibility).
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

// Loopback port 9 has no listener → ECONNREFUSED → Prisma P1001 immediately;
// connect_timeout=2 bounds it either way.
const REFUSED_DIRECT_URL = 'postgresql://x:x@127.0.0.1:9/nope?connect_timeout=2'

const originalDirectUrl = process.env.DIRECT_URL

beforeAll(() => {
  process.env.CRON_SECRET = 'test-cron-secret'
})

afterAll(() => {
  // Restore so a later file in the same worker (fileParallelism: false) acquires the
  // real lock again instead of inheriting the refused URL.
  if (originalDirectUrl === undefined) delete process.env.DIRECT_URL
  else process.env.DIRECT_URL = originalDirectUrl
})

function cronReq() {
  return new NextRequest('http://localhost/api/cron/dispatch', {
    method: 'POST',
    headers: { authorization: 'Bearer test-cron-secret' },
  })
}

async function cronLastRunAt(): Promise<Date | null> {
  const rows = await prisma.$queryRaw<{ cronLastRunAt: Date | null }[]>`
    SELECT "cronLastRunAt" FROM "notification_config" WHERE "id" = 'global'
  `
  return rows[0]?.cronLastRunAt ?? null
}

describe('CC-30: cron dispatch when the advisory-lock connection cannot be opened', () => {
  it('answers 500 {error:"advisory-lock-connect-error"}, reports it, and does NOT stamp the heartbeat', async () => {
    // Arm the dead-man row: a heartbeat row exists (tests/setup.ts never wipes it, so a
    // previous file may have stamped it) with cronLastRunAt explicitly NULL.
    await prisma.$executeRaw`
      INSERT INTO "notification_config" ("id", "cronLastRunAt") VALUES ('global', NULL)
      ON CONFLICT ("id") DO UPDATE SET "cronLastRunAt" = NULL
    `
    expect(await cronLastRunAt()).toBeNull()

    process.env.DIRECT_URL = REFUSED_DIRECT_URL
    // The route logs the failure on purpose; keep the test output clean.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const res = await cron(cronReq())
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: 'advisory-lock-connect-error' })

      // Visible, not swallowed: logged AND sent to Sentry exactly once.
      expect(consoleError).toHaveBeenCalledWith(
        '[cron] advisory-lock connect failed — cron did not run',
        expect.anything(),
      )
      expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1)
    } finally {
      consoleError.mockRestore()
      if (originalDirectUrl === undefined) delete process.env.DIRECT_URL
      else process.env.DIRECT_URL = originalDirectUrl
    }

    // Nothing ran: the heartbeat was not stamped, so CRON_SILENT stays armed.
    expect(await cronLastRunAt()).toBeNull()
  })

  it('control: with DIRECT_URL pointing at the real test DB the same request is a 200 that stamps the heartbeat', async () => {
    await prisma.$executeRaw`
      INSERT INTO "notification_config" ("id", "cronLastRunAt") VALUES ('global', NULL)
      ON CONFLICT ("id") DO UPDATE SET "cronLastRunAt" = NULL
    `
    const res = await cron(cronReq())
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    expect(await cronLastRunAt()).not.toBeNull()
  })
})
