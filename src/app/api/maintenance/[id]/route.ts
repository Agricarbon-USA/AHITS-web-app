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
    const task = await prisma.maintenanceTask.update({ where: { id }, data: parsed.data })
    return NextResponse.json({ data: task })
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
