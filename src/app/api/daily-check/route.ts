import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getActiveRigForOperator } from '@/lib/deployment-assignments'
import { requireAuth } from '@/lib/auth/session'
import { createAlert, resolveActiveAlert } from '@/lib/alerts'
import { applyOdometerReading } from '@/lib/maintenance'
import { parsePagination } from '@/lib/validation'
import { businessDate } from '@/lib/business-date'

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
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { vehicleId, checklistJson, passFail, issues, odometer, site, durationMs, gpsLat, gpsLng, gpsAccuracy } = parsed.data
  // Clamp to server-side business date so a check can't be pre-dated or
  // future-dated to dodge the missed-check alert (note: a check synced a day
  // late is recorded as today, not the day it was performed).
  const date = businessDate()

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
      await createAlert('DAILY_CHECK_FAILED', 'vehicles', vehicleId, {
        name: vehicle?.name ?? vehicleId,
        operatorName: session.name,
        issues: issues ?? 'No details provided',
        // CC-26: carry the failed check's id so its alert deep-links to the exact check.
        // The dedup update refreshes this, so a re-raise points at the latest failure.
        checkId: check.id,
      })
    } else {
      await resolveActiveAlert('DAILY_CHECK_FAILED', 'vehicles', vehicleId)
    }
    // Any submitted check (pass or fail) clears the MISSED alert — the operator
    // checked in for the day regardless of outcome.
    await resolveActiveAlert('DAILY_CHECK_MISSED', 'operators', session.userId)
  } catch (err) {
    console.error('[POST /api/daily-check] daily-check-failed alert failed', err)
  }

  return NextResponse.json({ data: check }, { status: 201 })
}
