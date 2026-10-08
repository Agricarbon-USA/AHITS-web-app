import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { VehicleType, VehicleStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getVehicleOperators } from '@/lib/deployment-assignments'
import { requireAuth, requireAdmin } from '@/lib/auth/session'
import { OPEN_TASK } from '@/lib/populations'
import { retireVehicle, setVehicleServiceStatus } from '@/lib/asset-status'
import { assertNoOpenReferences, openReferences, referenceConflictBody } from '@/lib/asset-references'
import { writeOr404 } from '@/lib/api-errors'

// Whitelist of admin-editable fields. Excludes id/createdAt/updatedAt and
// qrCodeId (QR association is set on create, not via a generic edit) to prevent
// mass-assignment. `.strict()` rejects any unexpected key.
const vehicleUpdateSchema = z
  .object({
    name: z.string().min(1),
    type: z.nativeEnum(VehicleType),
    year: z.number().int().nullable(),
    makeModel: z.string().nullable(),
    vin: z.string().nullable(),
    licensePlate: z.string().nullable(),
    odometer: z.number().int().nullable(),
    status: z.nativeEnum(VehicleStatus),
    location: z.string().nullable(),
    hubId: z.string().nullable(),
    insuranceExpires: z.coerce.date().nullable(),
    registrationExpires: z.coerce.date().nullable(),
    notes: z.string().nullable(),
    // NEW-5: rental metadata. isRental/rentalOneWay are NOT NULL columns, so they
    // can be set but not nulled; the rest are clearable.
    isRental: z.boolean(),
    rentalCompany: z.string().nullable(),
    rentalAgreementNumber: z.string().nullable(),
    rentalAgreementUrl: z.string().nullable(),
    rentalStartDate: z.coerce.date().nullable(),
    rentalEndDate: z.coerce.date().nullable(),
    rentalLocation: z.string().nullable(),
    rentalReturnLocation: z.string().nullable(),
    rentalCostAmount: z.number().nonnegative().nullable(),
    rentalCostPeriod: z.enum(['DAY', 'WEEK', 'MONTH', 'FLAT']).nullable(),
    rentalOneWay: z.boolean(),
  })
  .partial()
  .strict()

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, deletedAt: null },
    include: {
      dailyChecks: { orderBy: { date: 'desc' }, take: 10, include: { operator: true } },
      // PR-2 (C-11): open tasks only, so the drawer's count matches the list's.
      maintenanceTasks: { where: OPEN_TASK, orderBy: [{ nextDue: 'asc' }, { id: 'asc' }] },
      photos: { orderBy: { takenAt: 'desc' }, take: 6 },
    },
  })
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // CC-32 (2.2): the vehicle's most recent NON-EMPTY daily-check site, so the daily
  // check can pre-fill a field the operator otherwise retypes every morning. Purely
  // additive and read-side — no schema change, no write path, no status semantics.
  // Not derived from the `dailyChecks: take: 10` include above: ten checks with a
  // blank site would hide a real one. Null (field left empty) when nothing qualifies.
  const lastSiteCheck = await prisma.dailyCheck.findFirst({
    where: { vehicleId: id, AND: [{ site: { not: null } }, { site: { not: '' } }] },
    orderBy: [{ date: 'desc' }, { submittedAt: 'desc' }],
    select: { site: true },
  })
  const lastCheckSite = lastSiteCheck?.site ?? null

  // Merge hub + assigned-operator names via raw SQL (hubId newer than client).
  let hubId: string | null = null
  let hubName: string | null = null
  // W0-10 PR-1: derive the assigned operator once (id + name) from the assignment table.
  const vehicleOp = (await getVehicleOperators([id])).get(id) ?? null
  const assignedOperatorId = vehicleOp?.operatorId ?? null
  const assignedOperatorName = vehicleOp?.operatorName ?? null
  try {
    const rows = await prisma.$queryRaw<{ hubId: string | null; hubName: string | null }[]>`
      SELECT v."hubId", h."name" AS "hubName"
      FROM "vehicles" v
      LEFT JOIN "hubs" h ON h."id" = v."hubId"
      WHERE v."id" = ${id}
    `
    if (rows[0]) { hubId = rows[0].hubId; hubName = rows[0].hubName }
  } catch { /* hubId column missing pre-migration */ }

  return NextResponse.json({ data: { ...vehicle, assignedOperatorId, hubId, hubName, assignedOperatorName, lastCheckSite } })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const parsed = vehicleUpdateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const current = await prisma.vehicle.findFirst({ where: { id, deletedAt: null }, select: { status: true, name: true } })
  if (!current) return NextResponse.json({ error: 'Vehicle not found or update failed' }, { status: 404 })

  // PR-3b (D-g · U-7): status by hand is only the admin-owned states — ACTIVE,
  // OUT_OF_SERVICE, RETIRED. IN_MAINTENANCE comes from a repair (Report damage) and
  // leaves when the repair closes, so it can't be set — and Active can't be chosen
  // while a repair is still open. Sending the vehicle's current status unchanged (the
  // Edit form always sends it) is not a change and is not checked.
  const { hubId, status, ...rest } = parsed.data
  const changing = status !== undefined && status !== current.status
  if (changing && status === 'IN_MAINTENANCE') {
    return NextResponse.json({ error: 'In maintenance comes from a repair — use Report damage instead.' }, { status: 400 })
  }
  if (changing && status === 'ACTIVE' && current.status === 'IN_MAINTENANCE') {
    const repair = await prisma.maintenanceTask.findFirst({
      where: { ...OPEN_TASK, isDamageReport: true, vehicleId: id, inventoryUnitId: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { taskName: true },
    })
    if (repair) {
      return NextResponse.json({ error: `Close the repair first — "${repair.taskName}" is still open.` }, { status: 409 })
    }
  }
  try {
    // hubId is newer than the generated client — update it via raw SQL, the rest
    // through the typed client.
    const vehicle = await prisma.$transaction(async (tx) => {
      if (changing && status === 'RETIRED') {
        assertNoOpenReferences('vehicle', current.name, await openReferences({ vehicleId: id }, tx))
        await retireVehicle(tx, id, null)
      } else if (changing) {
        await setVehicleServiceStatus(tx, id, status as 'ACTIVE' | 'OUT_OF_SERVICE')
      }
      return tx.vehicle.update({ where: { id }, data: rest })
    })
    if ('hubId' in parsed.data) {
      await prisma.$executeRaw`UPDATE "vehicles" SET "hubId" = ${hubId ?? null} WHERE "id" = ${id}`
    }
    return NextResponse.json({ data: { ...vehicle, hubId: hubId ?? null } })
  } catch (err) {
    const conflict = referenceConflictBody(err)
    if (conflict) return NextResponse.json(conflict, { status: 409 })
    return NextResponse.json({ error: 'Vehicle not found or update failed' }, { status: 404 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  // Soft-delete (CR-8): never hard-delete a vehicle with check/maintenance
  // history — set the tombstone so reads hide it but history is preserved.
  // PR-3b (S-7): refused while a live deployment or a pending transfer holds it.
  const vehicle = await prisma.vehicle.findFirst({ where: { id, deletedAt: null }, select: { name: true } })
  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
  try {
    assertNoOpenReferences('vehicle', vehicle.name, await openReferences({ vehicleId: id }))
  } catch (err) {
    const conflict = referenceConflictBody(err)
    if (conflict) return NextResponse.json(conflict, { status: 409 })
    throw err
  }
  const notFound = await writeOr404(
    () => prisma.vehicle.update({ where: { id }, data: { deletedAt: new Date() } }),
    'Vehicle not found',
  )
  if (notFound) return notFound
  return NextResponse.json({ ok: true })
}
