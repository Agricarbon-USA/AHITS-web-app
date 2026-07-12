import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'

const schema = z
  .object({
    vehicleId: z.string().min(1).optional(),
    itemId: z.string().min(1).optional(),
    inventoryUnitId: z.string().min(1).optional(),
    notes: z.string().min(1),
    taskName: z.string().min(1).optional(),
  })
  .refine((d) => d.vehicleId || d.itemId, { message: 'vehicleId or itemId is required' })

/**
 * Log a fixed-in-field issue for a vehicle or equipment item. (CC-10)
 * Accessible by operators and admins.
 *
 * Writes a COMPLETED MaintenanceTask with resolutionPath=IN_FIELD. Does NOT
 * flip any vehicle/unit status and does NOT fire a DAMAGE_REPORTED alert — the
 * issue was noticed and fixed on the spot.
 */
export async function POST(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { vehicleId, itemId, inventoryUnitId, notes, taskName } = parsed.data

  const now = new Date()
  const task = await prisma.maintenanceTask.create({
    data: {
      taskName: taskName ?? 'Fixed in field',
      isDamageReport: true,
      resolutionPath: 'IN_FIELD',
      repairType: 'IN_FIELD',
      status: 'COMPLETED',
      completedAt: now,
      lastCompleted: now,
      notes,
      vehicleId: vehicleId ?? null,
      itemId: itemId ?? null,
      inventoryUnitId: inventoryUnitId ?? null,
    },
  })

  return NextResponse.json({ data: task }, { status: 201 })
}
