import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { createAlert } from '@/lib/alerts'
import { withIdempotency } from '@/lib/idempotency'
import { photoUrlsField, isPhotoNotUploadedError } from '@/lib/validation'
import { filterAllowedPhotoUrls } from '@/lib/photo-security'
import { getActiveRigForOperator } from '@/lib/deployment-assignments'

// CC-34 (2a): the unit half of the one "Report a problem" verb. Annotation, NOT removal —
// the kit item is never touched. Creates the damage task + bell; the self-triage toggle
// decides whether the unit's status flips (Out of service) or stays put (Still usable).
const schema = z.object({
  notes: z.string().min(1),
  photoUrls: photoUrlsField(), // rejects unresolved localphoto: refs (422)
  stillUsable: z.boolean().default(true),
}).superRefine((v, ctx) => {
  // §11.10 damage-photo rule: a unit problem report requires at least one photo (the
  // dialog enforces this too; this is the server backstop).
  if (v.photoUrls.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one photo is required', path: ['photoUrls'] })
  }
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ unitId: string }> }) {
  return withIdempotency(req, 'inventory.units.report-problem', () => _POST(req, ctx))
}

async function _POST(req: NextRequest, { params }: { params: Promise<{ unitId: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { unitId } = await params

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    // localphoto ref -> 422 (withIdempotency does not cache 422, so a corrected re-send is a
    // fresh attempt); every other validation failure -> 400.
    return NextResponse.json({ error: parsed.error.flatten() }, { status: isPhotoNotUploadedError(parsed.error) ? 422 : 400 })
  }
  const { notes, photoUrls, stillUsable } = parsed.data

  const unit = await prisma.inventoryUnit.findFirst({
    where: { id: unitId, deletedAt: null },
    select: { id: true, inventoryItemId: true, inventoryItem: { select: { name: true } } },
  })
  if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })

  // Attribute the report to the caller's active rig only when this unit actually sits in
  // that rig's kit — the report button appears on crewmate-kit and in-maintenance units too
  // (RIDER C 2a-a), so a blind "who holds this unit" lookup would mis-attribute the rig.
  const activeRigId = await getActiveRigForOperator(session.userId)
  let rigId: string | null = null
  if (activeRigId) {
    const inKit = await prisma.kitItem.findFirst({
      where: { inventoryUnitId: unitId, removedAt: null, kit: { rigId: activeRigId } },
      select: { id: true },
    })
    if (inKit) rigId = activeRigId
  }

  const task = await prisma.$transaction(async (tx) => {
    const t = await tx.maintenanceTask.create({
      data: {
        itemId: unit.inventoryItemId,
        inventoryUnitId: unit.id,
        taskName: `Reported problem: ${unit.inventoryItem.name}`,
        isDamageReport: true,
        status: 'IN_PROGRESS',
        rigId,
        reportedById: session.userId,
        notes,
      },
    })
    await createAlert('DAMAGE_REPORTED', 'maintenance_tasks', t.id, {
      itemName: unit.inventoryItem.name,
      operatorId: session.userId,
    }, tx)
    const urls = filterAllowedPhotoUrls(photoUrls)
    if (urls.length > 0) {
      await tx.photo.createMany({
        data: urls.map((url) => ({
          url,
          context: 'DAMAGE' as const,
          inventoryItemId: unit.inventoryItemId,
          maintenanceId: t.id,
          uploadedById: session.userId,
        })),
      })
    }
    // Self-triage: "Still usable" (default) keeps the unit CHECKED_OUT in the kit; "Out of
    // service" flips it to IN_MAINTENANCE. The kit item is NEVER removed either way.
    if (!stillUsable) {
      await tx.inventoryUnit.update({ where: { id: unit.id }, data: { status: 'IN_MAINTENANCE' } })
    }
    return t
  })

  return NextResponse.json({ data: task }, { status: 201 })
}
