import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { createAlert } from '@/lib/alerts'
import { withIdempotency } from '@/lib/idempotency'
import { photoUrlsField, isPhotoNotUploadedError } from '@/lib/validation'
import { filterAllowedPhotoUrls } from '@/lib/photo-security'

const schema = z.object({
  notes: z.string().min(1),
  repairType: z.enum(['IN_FIELD', 'AT_SHOP', 'SHIP_TO_HUB', 'SHIP_FOR_REPAIR']).optional(),
  // CC-34 (2a): the shared ReportProblemDialog sends photos + the self-triage toggle. Both
  // are optional so existing callers (admin/vehicles report-damage dialog) are unaffected.
  photoUrls: photoUrlsField(), // rejects unresolved localphoto: refs (422)
  // ROUTE default = flip. Only an explicit stillUsable:true skips the IN_MAINTENANCE flip;
  // a caller that omits the toggle (the pre-CC-34 admin dialog) keeps the old behavior.
  stillUsable: z.boolean().optional(),
})

/**
 * Report damage on a vehicle. (CC-10; CC-34 (2a) adds photos + self-triage toggle)
 * Accessible by operators and admins.
 *
 * Creates an IN_PROGRESS MaintenanceTask, flips the vehicle to IN_MAINTENANCE (unless the
 * caller self-triages "Still usable"), and fires a DAMAGE_REPORTED alert. The admin closes
 * the repair via POST /api/maintenance/[id]/complete. Wrapped in withIdempotency so an
 * offline-queue replay does not create a second task.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withIdempotency(req, 'vehicles.report-damage', () => _POST(req, ctx))
}

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: isPhotoNotUploadedError(parsed.error) ? 422 : 400 })
  }
  const { notes, repairType, photoUrls, stillUsable } = parsed.data

  const vehicle = await prisma.vehicle.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, status: true },
  })
  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })

  const result = await prisma.$transaction(async (tx) => {
    // stillUsable === true → annotation only; anything else (incl. absent) → flip.
    if (stillUsable !== true) {
      await tx.vehicle.update({ where: { id }, data: { status: 'IN_MAINTENANCE' as never } })
    }

    const task = await tx.maintenanceTask.create({
      data: {
        taskName: `Damage report: ${vehicle.name}`,
        isDamageReport: true,
        status: 'IN_PROGRESS',
        vehicleId: id,
        notes,
        repairType: repairType ?? null,
        reportedById: session.userId, // CC-34 (1b): reporter now has a home
      },
    })

    await createAlert(
      'DAMAGE_REPORTED',
      'maintenance_tasks',
      task.id,
      { vehicleName: vehicle.name, operatorId: session.userId },
      tx,
    )

    const urls = filterAllowedPhotoUrls(photoUrls)
    if (urls.length > 0) {
      await tx.photo.createMany({
        data: urls.map((url) => ({
          url,
          context: 'DAMAGE' as const,
          maintenanceId: task.id,
          vehicleId: id,
          uploadedById: session.userId,
        })),
      })
    }

    return task
  })

  return NextResponse.json({ data: result }, { status: 201 })
}
