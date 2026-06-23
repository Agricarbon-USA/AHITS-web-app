import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAlert } from '@/lib/alerts'
import { dispatchPendingAlerts } from '@/lib/notifications'

// Notification dispatcher, hit on a schedule by an external scheduler (e.g.
// GCP Cloud Scheduler). It is NOT behind the session auth — it is gated by a
// shared secret instead. Provide it as `Authorization: Bearer <CRON_SECRET>`
// or `?key=<CRON_SECRET>`.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // refuse if unconfigured rather than running open
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true
  if (req.nextUrl.searchParams.get('key') === secret) return true
  return false
}

async function run() {
  // 1) Scan: flag maintenance tasks past their due date and raise (deduped) alerts.
  const now = new Date()
  const due = await prisma.maintenanceTask.findMany({
    where: { status: { in: ['UPCOMING', 'DUE_SOON'] }, nextDue: { lt: now } },
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

  // 2) Dispatch: email admins + create in-app notifications for un-notified alerts.
  const dispatch = await dispatchPendingAlerts()
  return { overdueFlagged: due.length, ...dispatch }
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
