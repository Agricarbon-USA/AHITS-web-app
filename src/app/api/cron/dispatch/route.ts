import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { createAlert, resolveActiveAlert } from '@/lib/alerts'
import { dispatchPendingAlerts } from '@/lib/notifications'

// Notification dispatcher, hit on a schedule by an external scheduler (e.g.
// GCP Cloud Scheduler). It is NOT behind the session auth — it is gated by a
// shared secret instead. Provide it as `Authorization: Bearer <CRON_SECRET>`.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // refuse if unconfigured rather than running open
  // Header-only (never a query param, which would leak the secret into access
  // logs / URLs), compared in constant time.
  const provided = Buffer.from(req.headers.get('authorization') ?? '')
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

  // 3) Scan: low consumable stock → raise/clear LOW_INVENTORY alerts. Only
  // consumables with a configured threshold participate; the alert self-clears
  // once stock recovers above the threshold (resolveActiveAlert nulls activeKey).
  const consumables = await prisma.inventoryItem.findMany({
    where: { itemType: 'CONSUMABLE', deletedAt: null, lowStockThreshold: { not: null } },
    select: { id: true, name: true, quantity: true, lowStockThreshold: true },
  })
  let lowFlagged = 0
  for (const it of consumables) {
    const threshold = it.lowStockThreshold as number
    if (it.quantity <= threshold) {
      await createAlert('LOW_INVENTORY', 'inventory_items', it.id, {
        itemName: it.name,
        quantity: it.quantity,
        threshold,
      })
      lowFlagged++
    } else {
      await resolveActiveAlert('LOW_INVENTORY', 'inventory_items', it.id)
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

  // 5) Dispatch: email admins + create in-app notifications for un-notified alerts.
  const dispatch = await dispatchPendingAlerts()
  return { overdueFlagged: due.length, idempotencyReaped, lowInventoryFlagged: lowFlagged, expiryFlagged, ...dispatch }
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
