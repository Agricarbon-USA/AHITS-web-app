import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { createAlert, CRON_SILENT_SOURCE_TABLE, CRON_SILENT_SOURCE_ID } from '@/lib/alerts'
import { getCronLastRunAt } from '@/lib/notification-config'
import { listResponse } from '@/lib/validation'

// The read is deliberately capped — this route is hit on every admin page load.
const ALERTS_PAGE_SIZE = 50

// CC-22: how long the cron can go quiet before this read path raises CRON_SILENT.
// A dead cron can't report its own silence, so this is evaluated here (an admin
// read path that's hit often) instead of by the cron itself.
const CRON_STALE_MS = 30 * 60 * 1000

/**
 * CC-22 dead-man's-switch check: if the cron has a recorded run and it's
 * older than the staleness window, raise CRON_SILENT (deduped via activeKey,
 * so repeat calls are cheap no-ops). A NULL lastRunAt means the cron has never
 * run in this environment (e.g. a fresh deploy) — that must NOT raise an
 * alert, or every new environment would boot straight into a false alarm.
 * The cron itself resolves this alert on its next successful run.
 */
async function checkCronHeartbeat(): Promise<void> {
  const lastRunAt = await getCronLastRunAt()
  if (!lastRunAt) return
  const staleMs = Date.now() - lastRunAt.getTime()
  if (staleMs <= CRON_STALE_MS) return
  await createAlert('CRON_SILENT', CRON_SILENT_SOURCE_TABLE, CRON_SILENT_SOURCE_ID, {
    lastRunAt: lastRunAt.toISOString(),
    staleMinutes: Math.floor(staleMs / 60000),
  }).catch(() => {})
}

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await checkCronHeartbeat()

  const where = { resolved: false }
  const [alerts, total] = await Promise.all([
    prisma.alert.findMany({
      where,
      // L-13: stable tiebreaker (alerts raised in one cron pass share a timestamp).
      orderBy: [{ triggeredAt: 'desc' }, { id: 'asc' }],
      take: ALERTS_PAGE_SIZE,
    }),
    prisma.alert.count({ where }),
  ])
  // PR-1a (L-6/C-3): the dashboard banner counted THIS capped array while the
  // card beside it showed the true count, so the two disagreed past 50 open
  // alerts. The envelope carries the real total; PR-1b points the banner at it.
  return NextResponse.json(listResponse(alerts, total, { page: 1, pageSize: ALERTS_PAGE_SIZE }))
}
