import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

const RIG_INCLUDE = {
  operator: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  vehicles: {
    where: { removedAt: null },
    include: { vehicle: { select: { id: true, name: true, type: true, isRental: true } } },
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
              category: { select: { name: true } },
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
  const session = await getSession()
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

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { note, vehicleIds, kitItems, projectId, label } = parsed.data
  const operatorId = session.role === 'OPERATOR' ? session.userId : (parsed.data.operatorId ?? session.userId)

  const rig = await prisma.$transaction(async (tx) => {
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
      for (const ki of kitItems) {
        if ('inventoryUnitId' in ki && ki.inventoryUnitId) {
          const unit = await tx.inventoryUnit.findUnique({ where: { id: ki.inventoryUnitId } })
          if (!unit || unit.status !== 'AVAILABLE') throw new Error(`Unit ${ki.inventoryUnitId} is not available`)
          await tx.inventoryUnit.update({
            where: { id: ki.inventoryUnitId },
            data: { status: 'CHECKED_OUT' },
          })
          await tx.kitItem.create({
            data: { kitId: kit.id, inventoryItemId: ki.inventoryItemId, quantity: 1, inventoryUnitId: ki.inventoryUnitId },
          })
          await tx.checkLog.create({
            data: { action: 'CHECK_OUT', itemId: ki.inventoryItemId, inventoryUnitId: ki.inventoryUnitId, operatorId, projectId, notes: note },
          })
        } else {
          const quantity = (ki as { quantity: number }).quantity
          const available = await tx.inventoryUnit.findMany({
            where: { inventoryItemId: ki.inventoryItemId, status: 'AVAILABLE' },
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
            data: { action: 'CHECK_OUT', itemId: ki.inventoryItemId, operatorId, projectId, notes: note },
          })
        }
      }
    }

    return tx.rig.findUniqueOrThrow({ where: { id: newRig.id }, include: RIG_INCLUDE })
  })

  return NextResponse.json(rig, { status: 201 })
}
