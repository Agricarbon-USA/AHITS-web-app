import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { sendEmail } from '@/lib/email/resend'
import { dailyCheckFailedEmail } from '@/lib/email/templates'

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
