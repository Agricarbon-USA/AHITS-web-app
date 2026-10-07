import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { withIdempotency } from '@/lib/idempotency'
import { OPEN_TASK } from '@/lib/populations'
import { closeDamageTask } from '@/lib/maintenance'
import { restoreIfClear, type AssetRef } from '@/lib/asset-status'

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
 * D-c (PR-3a): "Log fixed issue" closes every open damage report on the asset
 * (`closeDamageTask(FIELD_FIX)`, alerts resolved) and returns it to service — vehicle
 * ACTIVE, unit CHECKED_OUT if it is still in a kit else AVAILABLE. Only IN_MAINTENANCE
 * is restored: an admin's OUT_OF_SERVICE (or an INOPERABLE / RETIRED unit) stays as it
 * is. Then the audit row: a COMPLETED MaintenanceTask with resolutionPath=IN_FIELD, as
 * before. No DAMAGE_REPORTED alert — the issue was noticed and fixed on the spot. An
 * item-only fix (no unit) has no asset to settle and writes the audit row alone.
 */
// CC-34 (2b): now routed through the operator offline queue (scan page mutate()), so wrap
// in withIdempotency — a timeout-replay of the same POST must not create a duplicate
// COMPLETED task. Body-hash bound; tolerates a missing Idempotency-Key for online callers.
export async function POST(req: NextRequest) {
  return withIdempotency(req, 'maintenance.field-fix', () => _POST(req))
}

async function _POST(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { vehicleId, itemId, inventoryUnitId, notes, taskName } = parsed.data

  const now = new Date()
  const asset: AssetRef | null = inventoryUnitId
    ? { kind: 'unit', id: inventoryUnitId }
    : vehicleId
      ? { kind: 'vehicle', id: vehicleId }
      : null

  const task = await prisma.$transaction(async (tx) => {
    if (asset) {
      const open = await tx.maintenanceTask.findMany({
        where: {
          ...OPEN_TASK,
          isDamageReport: true,
          ...(asset.kind === 'unit' ? { inventoryUnitId: asset.id } : { vehicleId: asset.id, inventoryUnitId: null }),
        },
        select: { id: true },
      })
      for (const t of open) await closeDamageTask(tx, t.id, 'FIELD_FIX')
    }
    const audit = await tx.maintenanceTask.create({
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
    // An asset left IN_MAINTENANCE with no open report (an orphan) is back in service too.
    if (asset) await restoreIfClear(tx, asset)
    return audit
  })

  return NextResponse.json({ data: task }, { status: 201 })
}
