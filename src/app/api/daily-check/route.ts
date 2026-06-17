import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { sendEmail } from '@/lib/email/resend'
import { dailyCheckFailedEmail } from '@/lib/email/templates'
import { createAlert } from '@/lib/alerts'

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
  const session = await getSession()
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
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { vehicleId, date, checklistJson, passFail, issues, odometer, site } = parsed.data

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

  // Fire-and-forget: alert if any kit items have been out > 90 days
  if (session.userId) {
    prisma.rig.findFirst({
      where: { operatorId: session.userId, endedAt: null },
      include: {
        kits: { include: { items: { where: { removedAt: null }, include: { item: { select: { name: true } } } } } },
      },
    }).then(async (rig) => {
      if (!rig) return
      const kitItems = rig.kits.flatMap((k) => k.items)
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      if (rig.startedAt < cutoff) {
        for (const ki of kitItems) {
          await createAlert('EQUIPMENT_NOT_RETURNED', 'kit_items', ki.id, {
            itemName: ki.item.name,
            rigId: rig.id,
            daysSinceCheckout: Math.floor((Date.now() - rig.startedAt.getTime()) / 86400000),
          })
        }
      }
    }).catch(() => {})
  }

  // Notify admin on fail
  if (!passFail && process.env.ADMIN_EMAIL) {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } })
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `Daily Check Failed — ${vehicle?.name}`,
      html: dailyCheckFailedEmail(vehicle?.name ?? vehicleId, session.name, issues ?? 'No details provided'),
    }).catch(console.error)
  }

  return NextResponse.json({ data: check }, { status: 201 })
}
