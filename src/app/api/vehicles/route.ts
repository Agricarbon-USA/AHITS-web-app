import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireAdmin } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')
  const type = searchParams.get('type')

  const vehicles = await prisma.vehicle.findMany({
    where: {
      deletedAt: null,
      ...(status && { status: status as never }),
      ...(type && { type: type as never }),
    },
    orderBy: { name: 'asc' },
    include: { _count: { select: { dailyChecks: true, maintenanceTasks: true } } },
  })

  // Merge hub + assigned-operator names via raw SQL — `hubId` is newer than the
  // generated client, so we read it the same best-effort way as Hub.email.
  // Tolerates a pre-migration DB (returns vehicles without hub fields).
  const meta = new Map<string, { hubId: string | null; hubName: string | null; assignedOperatorName: string | null }>()
  try {
    const rows = await prisma.$queryRaw<
      { id: string; hubId: string | null; hubName: string | null; assignedOperatorName: string | null }[]
    >`
      SELECT v."id",
             v."hubId",
             h."name" AS "hubName",
             u."name" AS "assignedOperatorName"
      FROM "vehicles" v
      LEFT JOIN "hubs" h ON h."id" = v."hubId"
      LEFT JOIN "users" u ON u."id" = v."assignedOperatorId"
      WHERE v."deletedAt" IS NULL
    `
    for (const r of rows) meta.set(r.id, { hubId: r.hubId, hubName: r.hubName, assignedOperatorName: r.assignedOperatorName })
  } catch { /* hubId column missing pre-migration */ }

  return NextResponse.json({
    data: vehicles.map((v) => ({
      ...v,
      hubId: meta.get(v.id)?.hubId ?? null,
      hubName: meta.get(v.id)?.hubName ?? null,
      assignedOperatorName: meta.get(v.id)?.assignedOperatorName ?? null,
    })),
  })
}

const createSchema = z.object({
  name: z.string().min(1),
  type: z.string(),
  year: z.number().int().optional(),
  makeModel: z.string().optional(),
  vin: z.string().optional(),
  licensePlate: z.string().optional(),
  odometer: z.number().int().optional(),
  location: z.string().optional(),
  hubId: z.string().optional(),
  insuranceExpires: z.string().datetime().optional(),
  registrationExpires: z.string().datetime().optional(),
  notes: z.string().optional(),
  // QR association-on-create (PRD §7.7): register the existing physical label's
  // code as this vehicle's QR id. Omit to auto-generate one.
  qrCodeId: z.string().trim().min(1).optional(),
})

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // hubId is newer than the generated client; create with the typed fields, then
  // set hubId via raw SQL so this works pre- and post-regeneration.
  const { hubId, ...createData } = parsed.data
  try {
    const vehicle = await prisma.vehicle.create({ data: createData as never })
    if (hubId) {
      await prisma.$executeRaw`UPDATE "vehicles" SET "hubId" = ${hubId} WHERE "id" = ${vehicle.id}`
    }
    return NextResponse.json({ data: { ...vehicle, hubId: hubId ?? null } }, { status: 201 })
  } catch (err: unknown) {
    // Unique violation (name / VIN / qrCodeId already in use).
    if ((err as { code?: string }).code === 'P2002') {
      const target = (err as { meta?: { target?: string[] } }).meta?.target?.join(', ') ?? 'field'
      const msg = target.includes('qrCodeId')
        ? 'That QR label is already assigned to another vehicle.'
        : `A vehicle with the same ${target} already exists.`
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    const msg = err instanceof Error ? err.message : 'Failed to create vehicle'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
