import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { nextDueFromInterval } from '@/lib/maintenance'
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
 *   • Damage report → terminal COMPLETED; the repaired unit returns to service
 *     and the alert(s) tied to the task are resolved.
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
    // Resolve alerts tied to this task either way (it's been serviced).
    await tx.alert.updateMany({
      where: { sourceTable: 'maintenance_tasks', sourceId: id, resolved: false },
      data: { resolved: true, resolvedAt: now, activeKey: null },
    })

    if (task.isDamageReport) {
      // One-off repair → terminal. Restore the asset to service.
      if (isVehicleTask) {
        // Vehicle damage: restore vehicle to ACTIVE if it was pulled.
        if (task.vehicle && task.vehicle.status === 'IN_MAINTENANCE') {
          await tx.vehicle.update({ where: { id: task.vehicleId! }, data: { status: 'ACTIVE' as never } })
        }
      } else {
        // CC-34 (3c): a "Still usable" field report (PR-2a) leaves a unit IN_MAINTENANCE
        // while it stays in the operator's kit. Flipping such a unit straight to AVAILABLE
        // on close would strand it — AVAILABLE inside an OPEN kit item on an ACTIVE rig, so
        // it's double-issuable and invisible to INV-5. If an open kit item still references
        // the unit, restore it to CHECKED_OUT (still in the kit); otherwise AVAILABLE (hub).
        const restoreStatusFor = async (unitId: string): Promise<'AVAILABLE' | 'CHECKED_OUT'> => {
          const openKit = await tx.kitItem.findFirst({
            where: { inventoryUnitId: unitId, removedAt: null, kit: { rig: { endedAt: null } } },
            select: { id: true },
          })
          return openKit ? 'CHECKED_OUT' : 'AVAILABLE'
        }
        // Unit damage: restore the specific unit (or the unambiguous UR-029 fallback).
        if (task.unit && task.unit.status === 'IN_MAINTENANCE') {
          await tx.inventoryUnit.update({ where: { id: task.unit.id }, data: { status: await restoreStatusFor(task.unit.id) } })
        } else if (!task.inventoryUnitId && task.itemId) {
          // UR-029 fallback for legacy tasks created before the unit was linked at
          // creation: if exactly one unit of this item is in maintenance, it's
          // unambiguously the one this repair covers — return it. Skip when
          // ambiguous (0 or >1 in maintenance) to avoid freeing the wrong unit.
          const inMaint = await tx.inventoryUnit.findMany({
            where: { inventoryItemId: task.itemId, status: 'IN_MAINTENANCE' },
            select: { id: true },
            take: 2,
          })
          if (inMaint.length === 1) {
            await tx.inventoryUnit.update({ where: { id: inMaint[0].id }, data: { status: await restoreStatusFor(inMaint[0].id) } })
          }
        }
      }
      const data: Prisma.MaintenanceTaskUpdateInput = {
        status: 'COMPLETED',
        completedAt: now,
        lastCompleted: now,
      }
      if (actualCost != null) data.actualCost = actualCost
      if (notes) data.notes = notes
      const updated = await tx.maintenanceTask.update({ where: { id }, data })
      // Persist the per-case return destination (A.4) for unit repairs. Raw SQL
      // because the columns are newer than the generated client; vehicle repairs
      // skip this — they have no return destination.
      if (!isVehicleTask) {
        await tx.$executeRaw`
          UPDATE "maintenance_tasks"
          SET "returnDestinationType" = ${returnDestinationType}::"ReturnDestinationType",
              "returnDestinationId" = ${returnDestinationId},
              "repairMethod" = ${repairMethod ?? null}::"RepairMethod"
          WHERE "id" = ${id}
        `
      }
      return updated
    }

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
