import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { createAlert, resolveActiveAlert } from '@/lib/alerts'
import { applyOdometerReading } from '@/lib/maintenance'
import { parsePagination } from '@/lib/validation'

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

  const { vehicleId, date, checklistJson, passFail, issues, odometer, site } = parsed.data

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
      syncedAt: new Date(),
    },
    update: {
      checklistJson: checklistJson as never,
      passFail,
      issues,
      odometer,
      site,
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
      const rig = await prisma.rig.findFirst({
        where: { operatorId: session.userId, endedAt: null },
        include: {
          kits: { include: { items: { where: { removedAt: null }, include: { item: { select: { name: true } } } } } },
        },
      })
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
      })
    } else {
      await resolveActiveAlert('DAILY_CHECK_FAILED', 'vehicles', vehicleId)
    }
  } catch (err) {
    console.error('[POST /api/daily-check] daily-check-failed alert failed', err)
  }

  return NextResponse.json({ data: check }, { status: 201 })
}
