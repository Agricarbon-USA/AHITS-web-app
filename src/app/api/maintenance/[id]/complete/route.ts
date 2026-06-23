import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { nextDueFromInterval } from '@/lib/maintenance'

const schema = z.object({
  actualOdometer: z.number().int().optional(),
  actualCost: z.number().optional(),
  notes: z.string().optional(),
})

/**
 * Complete a maintenance task. (Wave G)
 *   • Damage report → terminal COMPLETED; the repaired unit returns to service
 *     and the alert(s) tied to the task are resolved.
 *   • Scheduled recurring task → records this service (`lastCompleted`) and rolls
 *     `nextDue` / `nextOdometer` forward by the interval, staying active for the
 *     next cycle. Any overdue alert is resolved.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { actualOdometer, actualCost, notes } = parsed.data

  const task = await prisma.maintenanceTask.findUnique({
    where: { id },
    include: { vehicle: { select: { odometer: true } }, unit: { select: { id: true, status: true } } },
  })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date()

  const result = await prisma.$transaction(async (tx) => {
    // Resolve alerts tied to this task either way (it's been serviced).
    await tx.alert.updateMany({
      where: { sourceTable: 'maintenance_tasks', sourceId: id, resolved: false },
      data: { resolved: true, resolvedAt: now, activeKey: null },
    })

    if (task.isDamageReport) {
      // One-off repair → terminal. Return the unit to service if it was pulled.
      if (task.unit && task.unit.status === 'IN_MAINTENANCE') {
        await tx.inventoryUnit.update({ where: { id: task.unit.id }, data: { status: 'AVAILABLE' } })
      }
      const data: Prisma.MaintenanceTaskUpdateInput = {
        status: 'COMPLETED',
        completedAt: now,
        lastCompleted: now,
      }
      if (actualCost != null) data.actualCost = actualCost
      if (notes) data.notes = notes
      return tx.maintenanceTask.update({ where: { id }, data })
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
