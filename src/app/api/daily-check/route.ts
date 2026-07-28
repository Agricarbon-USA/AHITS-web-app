import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getActiveRigForOperator } from '@/lib/deployment-assignments'
import { requireAuth } from '@/lib/auth/session'
import { createAlert, resolveActiveAlert } from '@/lib/alerts'
import { applyOdometerReading } from '@/lib/maintenance'
import { parsePagination } from '@/lib/validation'
import { businessDate } from '@/lib/business-date'
import { withIdempotency } from '@/lib/idempotency'

// CC-29 item 4b: a client-stamped business date is trusted only within this bounded
// PAST window (days). Older-than-window or ANY future date is clamped to today's
// business date — the clamp's original job (block pre/future-dating to dodge the
// missed-check alert, FND-7) is preserved; only the bounded past is newly trusted so
// a legitimately late offline replay files under the day it was performed.
const PAST_WINDOW_DAYS = 3

const schema = z.object({
  vehicleId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  odometer: z.number().int().optional(),
  site: z.string().optional(),
  checklistJson: z.array(z.object({
    key: z.string(),
    label: z.string(),
    value: z.enum(['yes', 'no', 'na']),
    note: z.string().optional(),
  })),
  issues: z.string().optional(),
  passFail: z.boolean(),
  // CC-14: client-measured time-to-complete (form open → submit). Passive; capped to a
  // sane range server-side so a clock skew / stale queued payload can't store garbage.
  durationMs: z.number().int().min(0).max(86_400_000).optional(),
  // CC-15 (D2): GPS captured once per check at buildPayload time. All three are
  // optional — location is resolve-or-skip and NEVER blocks a check, so a
  // denied/dismissed/timed-out submit simply omits them. Bounded to valid ranges so a
  // bad on-device reading can't store garbage. Attestation points only, never live.
  gpsLat: z.number().min(-90).max(90).optional(),
  gpsLng: z.number().min(-180).max(180).optional(),
  gpsAccuracy: z.number().min(0).optional(),
}).superRefine((data, ctx) => {
  // PRD §11.4 / §7.4: every failed item needs a reason, and a failing check
  // needs an overall summary. Enforced server-side so the rule holds for queued
  // offline replays and any direct API call, not just the happy-path UI.
  const failing = data.checklistJson.filter((i) => i.value === 'no')
  if (failing.some((i) => !i.note || !i.note.trim())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['checklistJson'], message: 'Each item marked “No” must include a note describing the issue.' })
  }
  if (!data.passFail && !data.issues?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['issues'], message: 'A failing check requires an issue summary.' })
  }
})

export async function GET(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const vehicleId = searchParams.get('vehicleId')
  const date = searchParams.get('date')
  const operatorId = session.role === 'OPERATOR' ? session.userId : searchParams.get('operatorId')
  const { page, pageSize } = parsePagination(searchParams)

  const where = {
    ...(vehicleId && { vehicleId }),
    ...(date && { date: new Date(date) }),
    ...(operatorId && { operatorId }),
  }

  const [data, total] = await Promise.all([
    prisma.dailyCheck.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { date: 'desc' },
      include: { vehicle: true, operator: { select: { id: true, name: true } } },
    }),
    prisma.dailyCheck.count({ where }),
  ])

  return NextResponse.json({ data, total, page, pageSize })
}

export async function POST(req: NextRequest) {
  // CC-29 (discovered gap): wrap in withIdempotency (scope 'daily-check'). Item 4c
  // replaces the past-date upsert-update with a 409, so retry-safety can no longer
  // rely on the upsert alone — an exact replay whose 201 ack was lost (lie-fi) would
  // otherwise re-send and hit the new duplicate-check 409, a FALSE "Failed" for a
  // check that DID land. The idempotency layer returns the cached 201 for an exact
  // replay (handler never re-runs); a genuinely-different past-day check (new key)
  // still 409s. Same-day submits each mint a fresh key, so the upsert-update below is
  // untouched. No Idempotency-Key header → passes straight through (unchanged).
  return withIdempotency(req, 'daily-check', async () => {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { vehicleId, checklistJson, passFail, issues, odometer, site, durationMs, gpsLat, gpsLng, gpsAccuracy } = parsed.data
  // CC-29 item 4b: trust the client-stamped business date only inside the bounded
  // PAST window; clamp anything older or ANY future date to today. YYYY-MM-DD is
  // lexicographically ordered so the string comparisons are the date comparisons
  // (the schema regex already guarantees the shape). FND-7: the clamp still blocks
  // pre/future-dating — future dates fail `<= today` and are clamped — only a check
  // performed up to PAST_WINDOW_DAYS ago is newly trusted at its performed date.
  const today = businessDate()
  const earliest = businessDate(new Date(Date.now() - PAST_WINDOW_DAYS * 86_400_000))
  const clientDate = parsed.data.date
  let date: string
  if (clientDate >= earliest && clientDate <= today) {
    date = clientDate
  } else {
    date = today
    console.warn('[daily-check] client date out of window, clamped', { clientDate, earliest, today })
  }
  const isToday = date === today

  // Daily checks may be performed on ANY active vehicle/equipment — not just
  // items in the operator's deployment. Operators routinely inspect a vehicle
  // (selecting it manually or scanning its QR code) before it is ever attached
  // to a deployment; a "complete a check before operating any vehicle" workflow
  // requires that freedom (product decision; resolves UR-033). We only require
  // that the vehicle exists and isn't deleted — ownership is not required.
  const vehicleExists = await prisma.vehicle.findFirst({
    where: { id: vehicleId, deletedAt: null },
    select: { id: true },
  })
  if (!vehicleExists) {
    return NextResponse.json({ error: 'Vehicle not found.' }, { status: 404 })
  }

  // CC-29 item 4c: a late replay must never SILENTLY overwrite (or be overwritten by)
  // an existing check via the upsert. If this is a PAST date (≠ today) and a check
  // already exists for (vehicle, date, operator), surface a 409 — the queue marks it
  // 'failed' (409 ∈ TERMINAL_STATUSES) with this message, discard-able in the Outbox,
  // never merged. Same-day (date === today) keeps the upsert-update below: same-day
  // edit/resubmit is a feature, and withIdempotency already dedupes exact replays.
  if (!isToday) {
    const existing = await prisma.dailyCheck.findUnique({
      where: { vehicleId_date_operatorId: { vehicleId, date: new Date(date), operatorId: session.userId } },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json({ error: `A check for ${date} already exists for this vehicle.` }, { status: 409 })
    }
  }

  const check = await prisma.dailyCheck.upsert({
    where: {
      vehicleId_date_operatorId: {
        vehicleId,
        date: new Date(date),
        operatorId: session.userId,
      },
    },
    create: {
      vehicleId,
      operatorId: session.userId,
      date: new Date(date),
      checklistJson: checklistJson as never,
      passFail,
      issues,
      odometer,
      site,
      // CC-14: recorded on first completion only — a later edit (the update branch)
      // preserves the original time-to-complete rather than overwriting it.
      durationMs,
      // CC-15 (D2): the check's attestation GPS. Undefined when the operator denied /
      // dismissed / timed out — the row stores NULL and the check succeeds regardless.
      gpsLat,
      gpsLng,
      gpsAccuracy,
      syncedAt: new Date(),
    },
    update: {
      checklistJson: checklistJson as never,
      passFail,
      issues,
      odometer,
      site,
      // CC-15 (D2): best-available-fix-wins. Prisma skips `undefined`, so a re-submit
      // that denied/timed-out location PRESERVES a prior good fix instead of wiping it;
      // a re-submit that DID capture updates the point. Denial never destroys location.
      gpsLat,
      gpsLng,
      gpsAccuracy,
      syncedAt: new Date(),
    },
  })

  // Mileage trigger (Wave G): advance the vehicle odometer and flag any
  // mileage-based maintenance that's now due. Best-effort, never blocks the check.
  if (odometer != null) {
    await applyOdometerReading(vehicleId, odometer)
  }

  // Alert if any kit items have been out > 90 days. Awaited (not fire-and-forget)
  // so it runs reliably on serverless/Cloud Run, where a floating promise can be
  // dropped when the instance freezes after the response. Wrapped so an alert
  // failure is logged but never fails the check submission. createAlert dedupes on
  // (type, sourceTable, sourceId, unresolved), so this does not spam on every check.
  if (session.userId) {
    try {
      // W0-10 PR-4: find the operator's active rig via the assignment table (Rig.operatorId dropped).
      const activeRigId = await getActiveRigForOperator(session.userId)
      const rig = activeRigId
        ? await prisma.rig.findUnique({
            where: { id: activeRigId },
            include: {
              kits: { include: { items: { where: { removedAt: null }, include: { item: { select: { name: true } } } } } },
            },
          })
        : null
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      if (rig && rig.startedAt < cutoff) {
        const kitItems = rig.kits.flatMap((k) => k.items)
        for (const ki of kitItems) {
          await createAlert('EQUIPMENT_NOT_RETURNED', 'kit_items', ki.id, {
            itemName: ki.item.name,
            rigId: rig.id,
            daysSinceCheckout: Math.floor((Date.now() - rig.startedAt.getTime()) / 86400000),
          })
        }
      }
    } catch (err) {
      console.error('[POST /api/daily-check] equipment-not-returned alert failed', err)
    }
  }

  // UR-034: surface a failed check IN-APP, not only via email. Raise an alert
  // (deduped per vehicle via activeKey) so it shows in the admin Active Alerts
  // list immediately and the notification dispatcher delivers the bell +
  // (config-permitting) admin email — the same path every other alert uses.
  // A later passing check self-clears it, like LOW_INVENTORY. Wrapped so an
  // alert failure can never fail the check submission.
  try {
    if (!passFail) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: vehicleId, deletedAt: null },
        select: { name: true },
      })
      // CC-29 item 4d: a late FAILING check may still RAISE — admins should hear about
      // a real problem regardless of which day it was performed. Only the RESOLVE
      // paths below are gated on the check's own date.
      await createAlert('DAILY_CHECK_FAILED', 'vehicles', vehicleId, {
        name: vehicle?.name ?? vehicleId,
        operatorName: session.name,
        issues: issues ?? 'No details provided',
        // CC-26: carry the failed check's id so its alert deep-links to the exact check.
        // The dedup update refreshes this, so a re-raise points at the latest failure.
        checkId: check.id,
      })
    } else if (isToday) {
      // CC-29 item 4d: a yesterday PASS must not clear TODAY's live failed-vehicle
      // alert — only a check performed today speaks to today's condition.
      await resolveActiveAlert('DAILY_CHECK_FAILED', 'vehicles', vehicleId)
    }
    // CC-29 item 4d: only a check performed TODAY clears today's MISSED alert — a
    // late replay of yesterday's check must not mark today as covered.
    if (isToday) {
      await resolveActiveAlert('DAILY_CHECK_MISSED', 'operators', session.userId)
    }
  } catch (err) {
    console.error('[POST /api/daily-check] daily-check-failed alert failed', err)
  }

  return NextResponse.json({ data: check }, { status: 201 })
  })
}
