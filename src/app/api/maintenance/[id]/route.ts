import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { IntervalType, Priority, MaintenanceStatus, RepairType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'

// Whitelist of admin-editable fields. Excludes id/vehicleId/itemId (the task's
// subject) and isDamageReport (system-set) to prevent mass-assignment.
const maintenanceUpdateSchema = z
  .object({
    taskName: z.string().min(1),
    intervalType: z.nativeEnum(IntervalType),
    intervalValue: z.number().int(),
    priority: z.nativeEnum(Priority),
    lastCompleted: z.coerce.date().nullable(),
    lastOdometer: z.number().int().nullable(),
    nextDue: z.coerce.date().nullable(),
    nextOdometer: z.number().int().nullable(),
    status: z.nativeEnum(MaintenanceStatus),
    estimatedCost: z.number().nullable(),
    actualCost: z.number().nullable(),
    assigneeId: z.string().nullable(),
    hubId: z.string().nullable(),
    repairHubId: z.string().nullable(),
    notes: z.string().nullable(),
    completedAt: z.coerce.date().nullable(),
    repairType: z.nativeEnum(RepairType).nullable(),
    shopName: z.string().nullable(),
    shopAddress: z.string().nullable(),
    dateDelivered: z.coerce.date().nullable(),
  })
  .partial()
  .strict()

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const parsed = maintenanceUpdateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const data = { ...parsed.data }
      // Auto-stamp completion time when marking a task COMPLETED.
      if (parsed.data.status === 'COMPLETED' && parsed.data.completedAt == null) {
        data.completedAt = new Date()
      }
      const task = await tx.maintenanceTask.update({ where: { id }, data })

      // DAT-5: completing a repair returns the linked unit to service. Conditional
      // on IN_MAINTENANCE so we never resurrect a written-off (INOPERABLE) or
      // retired unit, and so a non-completing edit doesn't touch the unit.
      const isComplete = parsed.data.status === 'COMPLETED' || parsed.data.completedAt != null
      if (isComplete && task.inventoryUnitId) {
        await tx.inventoryUnit.updateMany({
          where: { id: task.inventoryUnitId, status: 'IN_MAINTENANCE' },
          data: {
            status: 'AVAILABLE',
            inoperableNotes: null,
            inoperableReportedAt: null,
            inoperableReportedById: null,
          },
        })
      }
      return task
    })
    return NextResponse.json({ data: result })
  } catch {
    return NextResponse.json({ error: 'Task not found or update failed' }, { status: 404 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  await prisma.maintenanceTask.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
