import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { resolveActiveAlert } from '@/lib/alerts'
import { withIdempotency } from '@/lib/idempotency'

// CC-34 (2c): promote a FAILED daily check into a repair task — admin triage, never
// automatic. Carries the operator's words + the failing items + the check's photos onto a
// live MaintenanceTask, then resolves the DAILY_CHECK_FAILED bell (triaged = resolved; the
// task is the live object now). Deliberately does NOT raise DAMAGE_REPORTED — one object,
// one bell thread, and the admin is already looking at it.

type ChecklistItem = { key: string; label: string; value: 'yes' | 'no' | 'na'; note?: string }

const bodySchema = z.object({
  flipVehicle: z.boolean().optional(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withIdempotency(req, 'daily-check.open-task', () => _POST(req, ctx))
}

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { flipVehicle } = parsed.data

  const check = await prisma.dailyCheck.findUnique({
    where: { id },
    select: { id: true, vehicleId: true, operatorId: true, issues: true, checklistJson: true, passFail: true },
  })
  if (!check) return NextResponse.json({ error: 'Check not found' }, { status: 404 })
  if (check.passFail) {
    return NextResponse.json({ error: 'This check passed — there is nothing to repair.' }, { status: 409 })
  }

  // Notes = the operator's issue summary + each failing item's "label: note" line, so the
  // repair task carries their words verbatim instead of the admin re-typing them.
  const items = Array.isArray(check.checklistJson) ? (check.checklistJson as unknown as ChecklistItem[]) : []
  const failingLines = items
    .filter((i) => i.value === 'no')
    .map((i) => `${i.label}: ${i.note ?? ''}`.trim())
  const notes = [check.issues, ...failingLines].filter((s) => s && s.trim()).join('\n') || 'From failed daily check'

  // rigId from the vehicle's active deployment, if any (a checked vehicle may be idle).
  const rv = await prisma.rigVehicle.findFirst({
    where: { vehicleId: check.vehicleId, removedAt: null, rig: { endedAt: null } },
    select: { rigId: true },
  })
  const rigId = rv?.rigId ?? null

  const task = await prisma.$transaction(async (tx) => {
    const t = await tx.maintenanceTask.create({
      data: {
        taskName: 'Repair from failed daily check',
        isDamageReport: true,
        status: 'IN_PROGRESS',
        vehicleId: check.vehicleId,
        notes,
        rigId,
        reportedById: check.operatorId, // the operator reported it, not the admin clicking
      },
    })
    // Re-link the check's photos to the task WITHOUT dropping dailyCheckId — one photo, two
    // contexts (it still belongs to the check; it now also documents the repair).
    await tx.photo.updateMany({ where: { dailyCheckId: check.id }, data: { maintenanceId: t.id } })
    if (flipVehicle) {
      await tx.vehicle.update({ where: { id: check.vehicleId }, data: { status: 'IN_MAINTENANCE' as never } })
    }
    return t
  })

  // Triaged = resolved: the failed-check bell clears now that the task is the live object.
  await resolveActiveAlert('DAILY_CHECK_FAILED', 'vehicles', check.vehicleId)

  return NextResponse.json({ data: task }, { status: 201 })
}
