import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { createAlert, resolveActiveAlert } from '@/lib/alerts'
import { dispatchPendingAlerts } from '@/lib/notifications'
import { allHubStockForScan } from '@/lib/inventory-stock'
import { releaseAllHeldForRequest } from '@/lib/deployment-requests'
import { businessDateTime } from '@/lib/business-date'
import { getNotificationConfig } from '@/lib/notification-config'

// Notification dispatcher, hit on a schedule by an external scheduler (e.g.
// GCP Cloud Scheduler). It is NOT behind the session auth — it is gated by a
// shared secret instead. Provide it as `Authorization: Bearer <CRON_SECRET>`.
function authorized(req: NextRequest): boolean {
  // .trim() both sides: a secret created with `echo` (or pasted in a console)
  // often carries a trailing newline, which would make `Bearer <secret>` never
  // match a clean header the scheduler sends — a 401 that's impossible to fix
  // from the header box. Trimming surrounding whitespace removes that footgun
  // without weakening the constant-time comparison of the high-entropy value.
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false // refuse if unconfigured rather than running open
  // Header-only (never a query param, which would leak the secret into access
  // logs / URLs), compared in constant time.
  const provided = Buffer.from((req.headers.get('authorization') ?? '').trim())
  const expected = Buffer.from(`Bearer ${secret}`)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

async function run() {
  // 1) Scan: flag maintenance tasks past their due date and raise (deduped) alerts.
  const now = new Date()
  const due = await prisma.maintenanceTask.findMany({
    where: {
      // Date-based intervals only: MILEAGE is driven by the daily-check odometer
      // trigger, and PER_DEPLOYMENT by deployment events — neither should be
      // flagged overdue by a calendar scan.
      intervalType: { in: ['DAYS', 'MONTHS'] },
      isDamageReport: false,
      status: { in: ['UPCOMING', 'DUE_SOON'] },
      nextDue: { lt: now },
      deletedAt: null,
    },
    include: { vehicle: { select: { name: true } }, item: { select: { name: true } } },
  })
  for (const t of due) {
    await prisma.maintenanceTask.update({ where: { id: t.id }, data: { status: 'OVERDUE' } })
    await createAlert('MAINTENANCE_OVERDUE', 'maintenance_tasks', t.id, {
      taskName: t.taskName,
      itemName: t.item?.name ?? t.vehicle?.name ?? null,
      daysPastDue: t.nextDue ? Math.floor((now.getTime() - t.nextDue.getTime()) / 86400000) : 0,
    })
  }

  // 2) Reap idempotency keys older than 48h so the dedup table doesn't grow
  // unbounded. The offline queue only replays within minutes of reconnecting,
  // so a 48h window is far longer than any legitimate replay needs.
  let idempotencyReaped = 0
  try {
    idempotencyReaped = Number(
      await prisma.$executeRaw`DELETE FROM idempotency_key WHERE created_at < NOW() - INTERVAL '48 hours'`,
    )
  } catch {
    /* table missing / transient — non-fatal */
  }

  // 3) Per-hub low-stock scan → raise/clear LOW_INVENTORY per (item, hub).
  // Uses allHubStockForScan (returns ALL rows, not just low ones) so the
  // clear path works: a hub that recovered above threshold still appears and
  // gets its alert resolved. Each (item,hub) pair dedupes independently via
  // a composite sourceId so two hubs' alerts for the same item don't collide.
  const hubStockRows = await allHubStockForScan()
  let lowFlagged = 0
  for (const row of hubStockRows) {
    const sourceId = `${row.itemId}:${row.hubId}`
    if (row.quantity <= row.threshold) {
      await createAlert('LOW_INVENTORY', 'inventory_items', sourceId, {
        itemName: row.itemName,
        hubName: row.hubName,
        hubId: row.hubId,
        quantity: row.quantity,
        threshold: row.threshold,
      })
      lowFlagged++
    } else {
      await resolveActiveAlert('LOW_INVENTORY', 'inventory_items', sourceId)
    }
  }

  // 4) Scan: vehicle insurance/registration expiring within 30 days (or already
  // expired) → raise/clear the matching alerts. Self-clears once the document is
  // renewed past the window (or the date is cleared / vehicle retired).
  const EXPIRY_WINDOW_DAYS = 30
  const expiryCutoff = new Date(now.getTime() + EXPIRY_WINDOW_DAYS * 86_400_000)
  const vehicles = await prisma.vehicle.findMany({
    where: { status: { not: 'RETIRED' } },
    select: { id: true, name: true, insuranceExpires: true, registrationExpires: true },
  })
  let expiryFlagged = 0
  for (const v of vehicles) {
    if (v.insuranceExpires && v.insuranceExpires <= expiryCutoff) {
      await createAlert('INSURANCE_EXPIRING', 'vehicles', v.id, { itemName: v.name, expiresAt: v.insuranceExpires.toISOString() })
      expiryFlagged++
    } else {
      await resolveActiveAlert('INSURANCE_EXPIRING', 'vehicles', v.id)
    }
    if (v.registrationExpires && v.registrationExpires <= expiryCutoff) {
      await createAlert('REGISTRATION_EXPIRING', 'vehicles', v.id, { itemName: v.name, expiresAt: v.registrationExpires.toISOString() })
      expiryFlagged++
    } else {
      await resolveActiveAlert('REGISTRATION_EXPIRING', 'vehicles', v.id)
    }
  }

  // 5) Scan: per-operator DAILY_CHECK_MISSED alert. Raised once per day, after
  // the configured cutoff, when an operator with an active rig hasn't submitted
  // any daily check for today (local date in APP_TIMEZONE — must agree with how
  // the client builds its date string; see UR-026 for the full alignment).
  // Self-clears when the operator submits any check (see /api/daily-check POST).
  const { dailyCheckCutoff } = await getNotificationConfig()
  const [cutoffHour, cutoffMinute] = dailyCheckCutoff.split(':').map(Number)

  // Shared business-date/-time helper (FND-7) so the cutoff scan and the client's
  // check date can never drift out of the APP_TIMEZONE business day.
  const { date: today, hour: localHour, minute: localMinute } = businessDateTime(now)

  const pastCutoff =
    localHour > cutoffHour ||
    (localHour === cutoffHour && localMinute >= cutoffMinute)
  let missedFlagged = 0

  const activeRigs = await prisma.rig.findMany({
    where: { endedAt: null },
    select: { operatorId: true, operator: { select: { name: true } } },
    distinct: ['operatorId'],
  })

  for (const rig of activeRigs) {
    const checkedToday = await prisma.dailyCheck.findFirst({
      where: { operatorId: rig.operatorId, date: new Date(today) },
      select: { id: true },
    })
    if (checkedToday) {
      await resolveActiveAlert('DAILY_CHECK_MISSED', 'operators', rig.operatorId)
    } else if (pastCutoff) {
      await createAlert('DAILY_CHECK_MISSED', 'operators', rig.operatorId, {
        operatorName: rig.operator.name,
        date: today,
        cutoff: dailyCheckCutoff,
      })
      missedFlagged++
    }
  }

  // 7) UR-010 (M5): release STALE holds. A fulfilled reservation whose operator never
  // claimed the held stock (or checked out at a different hub, H6) would otherwise
  // freeze that hub's reserve forever. After HOLD_TTL_HOURS past fulfilledAt, release
  // the unclaimed remainder back to free availability — guarded per-line by releasedAt
  // (releaseAllHeldForRequest) so a repeat run / admin release / cancel can't
  // double-release. Only reservedQty is freed (quantity totals untouched → no resync).
  // Math.floor + finite/≥1 guard: make_interval(hours => …) takes an integer, so a
  // mis-set non-integer/NaN env value must not throw or disable the sweep.
  const ttlParsed = Math.floor(Number(process.env.HOLD_TTL_HOURS ?? 72))
  const holdTtlHours = Number.isFinite(ttlParsed) && ttlParsed >= 1 ? ttlParsed : 72
  let holdsReleased = 0
  try {
    const staleReqs = await prisma.$queryRaw<{ requestId: string; operatorId: string | null; label: string | null }[]>`
      SELECT DISTINCT l."requestId" AS "requestId",
             COALESCE(r."forOperatorId", r."requestedById") AS "operatorId",
             r."label" AS "label"
      FROM "deployment_request_lines" l
      JOIN "deployment_requests" r ON r."id" = l."requestId"
      WHERE l."releasedAt" IS NULL
        AND l."heldQty" > l."claimedQty"
        AND r."status" = 'FULFILLED'
        AND r."fulfilledAt" < NOW() - make_interval(hours => ${holdTtlHours})
    `
    for (const row of staleReqs) {
      const released = await prisma.$transaction((tx) => releaseAllHeldForRequest(row.requestId, tx))
      if (released > 0) {
        holdsReleased++
        if (row.operatorId) {
          await prisma.notification.create({
            data: {
              userId: row.operatorId,
              type: 'RESERVATION_UPDATE',
              title: 'Held items returned to stock',
              body: row.label
                ? `Unclaimed held items for "${row.label}" were returned to hub stock after ${holdTtlHours}h.`
                : `Unclaimed held items were returned to hub stock after ${holdTtlHours}h.`,
              link: '/operator/requests',
            },
          }).catch(() => {})
        }
      }
    }
  } catch {
    /* held columns missing / transient — non-fatal */
  }

  // 8) Dispatch: email admins + create in-app notifications for un-notified alerts.
  const dispatch = await dispatchPendingAlerts()
  return { overdueFlagged: due.length, idempotencyReaped, lowInventoryFlagged: lowFlagged, expiryFlagged, missedFlagged, holdsReleased, ...dispatch }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true, ...(await run()) })
}

// GET supported too, so a plain scheduler HTTP target works without a body.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true, ...(await run()) })
}
