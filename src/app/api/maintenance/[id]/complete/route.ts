import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { closeDamageTask, nextDueFromInterval } from '@/lib/maintenance'
import { resolveAlertsFor } from '@/lib/alerts'
import { money } from '@/lib/validation'
import { withIdempotency } from '@/lib/idempotency'

const schema = z.object({
  actualOdometer: z.number().int().optional(),
  actualCost: money().optional(),
  notes: z.string().optional(),
  // A.4: where the repaired unit returns, chosen per-case on close. Required for a
  // damage-report close (enforced below); ignored for recurring scheduled tasks.
  returnDestinationType: z.enum(['HUB', 'DEPLOYMENT', 'OTHER_HUB']).optional(),
  returnDestinationId: z.string().min(1).optional(),
  repairMethod: z.enum(['DELIVER', 'SHIP']).optional(),
})

/**
 * Complete a maintenance task. (Wave G)
 *   • Damage report → `closeDamageTask(COMPLETED)` (PR-3a): terminal COMPLETED, its
 *     alerts resolved, and the asset back in service only if no other open report
 *     still holds it (S-5 — closing one of two reports used to restore early).
 *   • Scheduled recurring task → records this service (`lastCompleted`) and rolls
 *     `nextDue` / `nextOdometer` forward by the interval, staying active for the
 *     next cycle. Any overdue alert is resolved.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withIdempotency(req, 'maintenance.complete.POST', () => _POST(req, ctx))
}

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { actualOdometer, actualCost, notes, returnDestinationType, returnDestinationId, repairMethod } = parsed.data

  const task = await prisma.maintenanceTask.findFirst({
    where: { id, deletedAt: null },
    include: { vehicle: { select: { id: true, odometer: true, status: true } }, unit: { select: { id: true, status: true } } },
  })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Vehicle-only damage reports (no inventoryUnitId) skip the unit-return flow.
  const isVehicleTask = !!task.vehicleId && !task.inventoryUnitId

  // A.4: closing a unit damage-report repair requires an explicit return destination.
  // Vehicle damage reports are closed without a return destination — the admin
  // manages vehicle status directly via PATCH /api/vehicles/[id].
  if (task.isDamageReport && !isVehicleTask) {
    if (!returnDestinationType || !returnDestinationId) {
      return NextResponse.json({ error: 'Choose where the unit returns before closing the repair.' }, { status: 400 })
    }
    if (returnDestinationType === 'HUB' || returnDestinationType === 'OTHER_HUB') {
      const hub = await prisma.hub.findFirst({ where: { id: returnDestinationId, isActive: true }, select: { id: true } })
      if (!hub) return NextResponse.json({ error: 'Return hub not found or inactive.' }, { status: 400 })
    } else if (returnDestinationType === 'DEPLOYMENT') {
      const rig = await prisma.rig.findFirst({ where: { id: returnDestinationId, endedAt: null }, select: { id: true } })
      if (!rig) return NextResponse.json({ error: 'Return deployment not found or already ended.' }, { status: 400 })
    }
  }

  const now = new Date()

  const result = await prisma.$transaction(async (tx) => {
    if (task.isDamageReport) {
      // A.4: the per-case return destination is recorded for unit repairs; vehicle
      // repairs have none. The task is marked COMPLETED before the restore check.
      await closeDamageTask(tx, id, 'COMPLETED', {
        actualCost: actualCost ?? null,
        notes: notes || null,
        ...(!isVehicleTask && {
          returnDestinationType: returnDestinationType ?? null,
          returnDestinationId: returnDestinationId ?? null,
          repairMethod: repairMethod ?? null,
        }),
      })
      return tx.maintenanceTask.findUniqueOrThrow({ where: { id } })
    }

    // Resolve alerts tied to this task (it's been serviced).
    await resolveAlertsFor('maintenance_tasks', id, tx)

    // Recurring scheduled task → roll forward.
    const data: Prisma.MaintenanceTaskUpdateInput = {
      status: 'UPCOMING',
      completedAt: null,
      lastCompleted: now,
    }
    if (actualCost != null) data.actualCost = actualCost
    if (notes) data.notes = notes

    if (task.intervalType === 'MILEAGE') {
      const base =
        actualOdometer ??
        task.vehicle?.odometer ??
        task.lastOdometer ??
        (task.nextOdometer != null ? task.nextOdometer - task.intervalValue : 0)
      data.lastOdometer = base
      data.nextOdometer = base + task.intervalValue
      data.nextDue = null
    } else if (task.intervalType === 'DAYS' || task.intervalType === 'MONTHS') {
      data.nextDue = nextDueFromInterval(task.intervalType, task.intervalValue, now)
    } else {
      // PER_DEPLOYMENT: no time/mileage schedule. Clear nextDue so the date-based
      // overdue scan can't immediately re-flag the just-completed task into a
      // permanent alert loop; it re-arms on deployment events (a future enhancement).
      data.nextDue = null
    }

    return tx.maintenanceTask.update({ where: { id }, data })
  })

  return NextResponse.json({ data: result })
}
