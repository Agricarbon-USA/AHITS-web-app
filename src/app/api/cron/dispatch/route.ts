import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { createAlert, resolveActiveAlert } from '@/lib/alerts'
import { dispatchPendingAlerts } from '@/lib/notifications'
import { allHubStockForScan } from '@/lib/inventory-stock'
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

  // Derive tz-local date and wall-clock time using Intl so we don't need a
  // date-fns/luxon dependency. 'en-CA' gives zero-padded ISO-style parts.
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: process.env.APP_TIMEZONE ?? 'America/Chicago',
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).formatToParts(now).map((x) => [x.type, x.value]),
  )
  const today = `${p.year}-${p.month}-${p.day}` // tz-local date, e.g. "2026-06-30"
  const localHour = Number(p.hour)
  const localMinute = Number(p.minute)

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

  // 6) Dispatch: email admins + create in-app notifications for un-notified alerts.
  const dispatch = await dispatchPendingAlerts()
  return { overdueFlagged: due.length, idempotencyReaped, lowInventoryFlagged: lowFlagged, expiryFlagged, missedFlagged, ...dispatch }
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
