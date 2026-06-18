import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { CONSUMABLE } from '@/lib/inventory'
import { assertConsumableAvailable, InsufficientStockError } from '@/lib/consumables'
import { withIdempotency } from '@/lib/idempotency'

const RIG_INCLUDE = {
  operator: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  vehicles: {
    where: { removedAt: null },
    include: { vehicle: { select: { id: true, name: true, type: true } } },
  },
  kits: {
    include: {
      items: {
        where: { removedAt: null },
        include: {
          item: {
            select: {
              id: true,
              name: true,
              itemType: true,
              categoryRef: { select: { name: true } },
            },
          },
          inventoryUnit: {
            select: { id: true, qrCodeId: true, serialNumber: true, status: true },
          },
        },
      },
    },
  },
  secondaryOperators: {
    include: { operator: { select: { id: true, name: true, email: true } } },
  },
} as const

const createSchema = z.object({
  operatorId: z.string().optional(),
  projectId: z.string().optional(),
  label: z.string().optional(),
  note: z.string().min(1, 'Note is required'),
  vehicleIds: z.array(z.string()).default([]),
  kitItems: z.array(z.union([
    z.object({
      inventoryItemId: z.string(),
      quantity: z.number().int().min(1),
      inventoryUnitId: z.undefined().optional(),
    }),
    z.object({
      inventoryItemId: z.string(),
      itemType: z.literal('SERIALIZED'),
      inventoryUnitId: z.string(),
    }),
  ])).default([]),
})

export async function GET(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const activeParam = searchParams.get('active')
  const active = activeParam === null || activeParam === 'true'
  const operatorIdParam = searchParams.get('operatorId')
  const projectId = searchParams.get('projectId')

  const operatorId = session.role === 'OPERATOR' ? session.userId : (operatorIdParam ?? undefined)

  const rigs = await prisma.rig.findMany({
    where: {
      ...(active ? { endedAt: null } : { endedAt: { not: null } }),
      ...(projectId && { projectId }),
      // Operators see deployments where they are primary OR secondary
      ...(session.role === 'OPERATOR'
        ? { OR: [{ operatorId: session.userId }, { secondaryOperators: { some: { operatorId: session.userId } } }] }
        : operatorId ? { operatorId } : {}),
    },
    include: RIG_INCLUDE,
    orderBy: { startedAt: 'desc' },
  })

  return NextResponse.json(rigs)
}

// Wrapped in withIdempotency (OFF-3): the My Rig "start deployment" now routes
// through the offline queue, so a replay must not create a second deployment.
export async function POST(req: NextRequest) {
  return withIdempotency(req, 'deployments.create.POST', () => _POST(req))
}

async function _POST(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { note, vehicleIds, kitItems, projectId, label } = parsed.data
  const operatorId = session.role === 'OPERATOR' ? session.userId : (parsed.data.operatorId ?? session.userId)

  let rig
  try {
  rig = await prisma.$transaction(async (tx) => {
    const newRig = await tx.rig.create({
      data: { operatorId, projectId, label },
    })

    if (vehicleIds.length > 0) {
      await tx.rigVehicle.createMany({
        data: vehicleIds.map((vehicleId) => ({
          rigId: newRig.id,
          vehicleId,
          addNote: note,
        })),
      })
      await tx.vehicle.updateMany({
        where: { id: { in: vehicleIds } },
        data: { assignedOperatorId: operatorId },
      })
    }

    const kit = await tx.kit.create({ data: { rigId: newRig.id } })

    if (kitItems.length > 0) {
      // Resolve each item's real type from the DB so consumables are never
      // routed down the serialized-unit path (and vice versa).
      const itemTypeById = new Map<string, string>(
        (
          await tx.inventoryItem.findMany({
            where: { id: { in: [...new Set(kitItems.map((k) => k.inventoryItemId))] } },
            select: { id: true, itemType: true },
          })
        ).map((r) => [r.id, r.itemType]),
      )

      for (const ki of kitItems) {
        if ('inventoryUnitId' in ki && ki.inventoryUnitId) {
          // SERIALIZED — a specific unit was picked. Atomic compare-and-set.
          const result = await tx.inventoryUnit.updateMany({
            where: { id: ki.inventoryUnitId, inventoryItemId: ki.inventoryItemId, status: 'AVAILABLE', deletedAt: null },
            data: { status: 'CHECKED_OUT' },
          })
          if (result.count === 0) {
            throw Object.assign(new Error('UNIT_CONFLICT'), { unitId: ki.inventoryUnitId })
          }
          await tx.kitItem.create({
            data: { kitId: kit.id, inventoryItemId: ki.inventoryItemId, quantity: 1, inventoryUnitId: ki.inventoryUnitId },
          })
          await tx.checkLog.create({
            data: { action: 'CHECK_OUT', itemId: ki.inventoryItemId, inventoryUnitId: ki.inventoryUnitId, operatorId, rigId: newRig.id, projectId, notes: note },
          })
        } else if (itemTypeById.get(ki.inventoryItemId) === CONSUMABLE) {
          // CONSUMABLE — reserve by quantity against derived availability.
          // No unit rows; owned stock is not decremented until the items are
          // actually consumed (logged as usage), only when returned.
          const quantity = (ki as { quantity: number }).quantity
          await assertConsumableAvailable(tx, ki.inventoryItemId, quantity)
          await tx.kitItem.create({
            data: { kitId: kit.id, inventoryItemId: ki.inventoryItemId, quantity, inventoryUnitId: null },
          })
          await tx.checkLog.create({
            data: { action: 'CHECK_OUT', itemId: ki.inventoryItemId, operatorId, rigId: newRig.id, projectId, notes: note },
          })
        } else {
          // SERIALIZED without a specific unit — auto-pick N available units.
          const quantity = (ki as { quantity: number }).quantity
          const available = await tx.inventoryUnit.findMany({
            where: { inventoryItemId: ki.inventoryItemId, status: 'AVAILABLE', deletedAt: null },
            take: quantity,
          })
          if (available.length > 0) {
            await tx.inventoryUnit.updateMany({
              where: { id: { in: available.map((u) => u.id) } },
              data: { status: 'CHECKED_OUT' },
            })
          }
          await tx.kitItem.create({
            data: { kitId: kit.id, inventoryItemId: ki.inventoryItemId, quantity, inventoryUnitId: null },
          })
          await tx.checkLog.create({
            data: { action: 'CHECK_OUT', itemId: ki.inventoryItemId, operatorId, rigId: newRig.id, projectId, notes: note },
          })
        }
      }
    }

    return tx.rig.findUniqueOrThrow({ where: { id: newRig.id }, include: RIG_INCLUDE })
  })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'UNIT_CONFLICT') {
      return NextResponse.json(
        { error: 'A selected unit was just checked out by someone else. Please select a different unit and try again.' },
        { status: 409 }
      )
    }
    if (err instanceof InsufficientStockError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    // Return the actual error as JSON instead of re-throwing (which produces non-JSON 500)
    const msg = err instanceof Error ? err.message : 'Failed to create deployment'
    console.error('[POST /api/deployments]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json(rig, { status: 201 })
}
