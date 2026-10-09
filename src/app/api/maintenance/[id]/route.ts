import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { IntervalType, Priority, MaintenanceStatus, RepairType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireAdmin } from '@/lib/auth/session'
import { money } from '@/lib/validation'
import { resolveAlertsFor } from '@/lib/alerts'
import { closeDamageTask, OpenRepairExists } from '@/lib/maintenance'

// Whitelist of admin-editable fields. Excludes id/vehicleId/itemId (the task's
// subject) and isDamageReport (system-set) to prevent mass-assignment.
const maintenanceUpdateSchema = z
  .object({
    taskName: z.string().min(1),
    intervalType: z.nativeEnum(IntervalType),
    intervalValue: z.number().int().min(1),
    priority: z.nativeEnum(Priority),
    lastCompleted: z.coerce.date().nullable(),
    lastOdometer: z.number().int().nullable(),
    nextDue: z.coerce.date().nullable(),
    nextOdometer: z.number().int().nullable(),
    status: z.nativeEnum(MaintenanceStatus),
    estimatedCost: money().nullable(),
    actualCost: money().nullable(),
    assigneeId: z.string().nullable(),
    hubId: z.string().nullable(),
    repairHubId: z.string().nullable(),
    notes: z.string().nullable(),
    completedAt: z.coerce.date().nullable(),
    repairType: z.nativeEnum(RepairType).nullable(),
    shopName: z.string().nullable(),
    shopAddress: z.string().nullable(),
    dateDelivered: z.coerce.date().nullable(),
    purchaseOrder: z.string().nullable(),
    invoiceNumber: z.string().nullable(),
    locationNote: z.string().nullable(),
  })
  .partial()
  .strict()

/**
 * PR-1a (U-4/P-11): one task by id. Did not exist — which is why an alert's
 * "View" link (`/admin/maintenance?task=<id>`) opened nothing: the page could only
 * find the task if it happened to be in the page of rows it had fetched. With
 * this, the deep-link opens the task whatever page it lives on, or the page can
 * say honestly that the repair is closed or gone.
 *
 * Operator-readable (the same audience as the list), with the same admin-only
 * cost stripping as `GET /api/maintenance`. Soft-deleted tasks are NOT returned —
 * a deleted report's alert link must read as "no longer exists", not open a ghost.
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const task = await prisma.maintenanceTask.findFirst({
    where: { id, deletedAt: null },
    include: {
      vehicle: { select: { id: true, name: true } },
      item: { select: { id: true, name: true } },
      unit: { select: { id: true, qrCodeId: true, serialNumber: true, status: true } },
      repairHub: { select: { id: true, name: true } },
      hub: { select: { id: true, name: true } },
      photos: { select: { id: true, url: true, takenAt: true }, orderBy: { takenAt: 'desc' } },
    },
  })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  // CC-34 (1b) parity with the list route: rigId/reportedById are scalar FKs, so
  // resolve their labels here too — the drawer renders the same fields.
  const [rig, reportedBy] = await Promise.all([
    task.rigId
      ? prisma.rig.findUnique({ where: { id: task.rigId }, select: { id: true, label: true } })
      : Promise.resolve(null),
    task.reportedById
      ? prisma.user.findUnique({ where: { id: task.reportedById }, select: { id: true, name: true } })
      : Promise.resolve(null),
  ])

  const withRefs = { ...task, rig, reportedBy }
  if (session.role === 'ADMIN') return NextResponse.json({ data: withRefs })
  const { estimatedCost, actualCost, ...rest } = withRefs
  void estimatedCost
  void actualCost
  return NextResponse.json({ data: rest })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const parsed = maintenanceUpdateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const current = await prisma.maintenanceTask.findFirst({
    where: { id, deletedAt: null },
    select: { isDamageReport: true, status: true },
  })
  if (!current) return NextResponse.json({ error: 'Task not found or update failed' }, { status: 404 })

  // PR-3a (S-4 / U-7): on a damage report, a status edit moves the asset too.
  // Setting COMPLETED closes the repair (`closeDamageTask`: alerts resolved, asset
  // restored only if no other open report holds it); moving a COMPLETED report back
  // to an open status is Reopen (asset pulled again). Other fields save as before.
  // Scheduled tasks keep the plain field update.
  const { status, ...fields } = parsed.data
  const closing = current.isDamageReport && status === 'COMPLETED' && current.status !== 'COMPLETED'
  const reopening = current.isDamageReport && status !== undefined && status !== 'COMPLETED' && current.status === 'COMPLETED'
  try {
    const task = await prisma.$transaction(async (tx) => {
      if (closing) await closeDamageTask(tx, id, 'COMPLETED')
      if (reopening) await closeDamageTask(tx, id, 'REOPEN')
      return tx.maintenanceTask.update({
        where: { id },
        data: closing || reopening ? { ...fields, ...(reopening && { status }) } : parsed.data,
      })
    })
    return NextResponse.json({ data: task })
  } catch (err) {
    if (err instanceof OpenRepairExists) return NextResponse.json({ error: err.message }, { status: 409 })
    return NextResponse.json({ error: 'Task not found or update failed' }, { status: 404 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  // Soft-delete (CR-8): preserve the repair/damage record rather than hard-delete.
  const task = await prisma.maintenanceTask.findFirst({ where: { id, deletedAt: null }, select: { isDamageReport: true } })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  // CC-34 (1c): a report mis-filed and deleted (instead of completed) must not leave a
  // permanent bell ghost — its alerts resolve. PR-3a: a deleted damage report also
  // releases its asset through `closeDamageTask(DELETED)` (restored only if no other open
  // report holds it); it used to stay In Maintenance with nothing tracking it (S-4).
  await prisma.$transaction(async (tx) => {
    if (task.isDamageReport) {
      await closeDamageTask(tx, id, 'DELETED')
    } else {
      await tx.maintenanceTask.update({ where: { id }, data: { deletedAt: new Date() } })
      await resolveAlertsFor('maintenance_tasks', id, tx)
    }
  })
  return NextResponse.json({ ok: true })
}
