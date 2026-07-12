import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { createAlert } from '@/lib/alerts'

const schema = z.object({
  notes: z.string().min(1),
  repairType: z.enum(['IN_FIELD', 'AT_SHOP', 'SHIP_TO_HUB', 'SHIP_FOR_REPAIR']).optional(),
})

/**
 * Report damage on a vehicle. (CC-10)
 * Accessible by operators and admins.
 *
 * Creates an IN_PROGRESS MaintenanceTask, flips the vehicle to IN_MAINTENANCE,
 * and fires a DAMAGE_REPORTED alert. The admin closes the repair via
 * POST /api/maintenance/[id]/complete.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { notes, repairType } = parsed.data

  const vehicle = await prisma.vehicle.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, status: true },
  })
  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })

  const result = await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id }, data: { status: 'IN_MAINTENANCE' as never } })

    const task = await tx.maintenanceTask.create({
      data: {
        taskName: `Damage report: ${vehicle.name}`,
        isDamageReport: true,
        status: 'IN_PROGRESS',
        vehicleId: id,
        notes,
        repairType: repairType ?? null,
      },
    })

    await createAlert(
      'DAMAGE_REPORTED',
      'maintenance_tasks',
      task.id,
      { vehicleName: vehicle.name, operatorId: session.userId },
      tx,
    )

    return task
  })

  return NextResponse.json({ data: result }, { status: 201 })
}
