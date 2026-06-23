import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { sendEmail } from '@/lib/email/resend'
import { dailyCheckFailedEmail } from '@/lib/email/templates'
import { createAlert } from '@/lib/alerts'
import { applyOdometerReading } from '@/lib/maintenance'

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
})

export async function GET(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const vehicleId = searchParams.get('vehicleId')
  const date = searchParams.get('date')
  const operatorId = session.role === 'OPERATOR' ? session.userId : searchParams.get('operatorId')
  const page = parseInt(searchParams.get('page') ?? '1')
  const pageSize = parseInt(searchParams.get('pageSize') ?? '25')

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

  // An operator may only submit a daily check for a vehicle they actually operate:
  // one assigned to them or in an active deployment they are on (primary or secondary).
  // Without this, any operator could pollute another vehicle's check history and
  // trigger admin "check failed" alerts for vehicles they have nothing to do with.
  if (session.role === 'OPERATOR') {
    const owns = await prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        deletedAt: null,
        OR: [
          { assignedOperatorId: session.userId },
          {
            rigVehicles: {
              some: {
                removedAt: null,
                rig: {
                  endedAt: null,
                  OR: [
                    { operatorId: session.userId },
                    { secondaryOperators: { some: { operatorId: session.userId } } },
                  ],
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    })
    if (!owns) {
      return NextResponse.json(
        { error: 'You can only submit a daily check for a vehicle in your active deployment.' },
        { status: 403 }
      )
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

  // Notify admin on fail
  if (!passFail && process.env.ADMIN_EMAIL) {
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, deletedAt: null } })
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `Daily Check Failed — ${vehicle?.name}`,
      html: dailyCheckFailedEmail(vehicle?.name ?? vehicleId, session.name, issues ?? 'No details provided'),
    }).catch(console.error)
  }

  return NextResponse.json({ data: check }, { status: 201 })
}
