import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { resolveActiveAlert } from '@/lib/alerts'
import { openDamageTask } from '@/lib/maintenance'
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

  // PR-3a: through `openDamageTask` with source DAILY_CHECK — no DAMAGE_REPORTED bell (see
  // above), and a vehicle that already has an open repair gets these notes appended to it
  // instead of a second task. `flipVehicle` is the admin's "take it out of use" choice.
  const task = await prisma.$transaction(async (tx) => {
    const { task: t } = await openDamageTask(tx, { kind: 'vehicle', id: check.vehicleId }, {
      taskName: 'Repair from failed daily check',
      notes,
      rigId,
      reportedById: check.operatorId, // the operator reported it, not the admin clicking
      source: 'DAILY_CHECK',
      pull: flipVehicle === true,
    })
    // Re-link the check's photos to the task WITHOUT dropping dailyCheckId — one photo, two
    // contexts (it still belongs to the check; it now also documents the repair).
    await tx.photo.updateMany({ where: { dailyCheckId: check.id }, data: { maintenanceId: t.id } })
    return tx.maintenanceTask.findUniqueOrThrow({ where: { id: t.id } })
  })

  // Triaged = resolved: the failed-check bell clears now that the task is the live object.
  await resolveActiveAlert('DAILY_CHECK_FAILED', 'vehicles', check.vehicleId)

  return NextResponse.json({ data: task }, { status: 201 })
}
