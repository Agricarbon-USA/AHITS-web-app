import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

const schema = z.object({
  toOperatorId: z.string().min(1, 'Destination operator is required'),
  note: z.string().min(1, 'Note is required'),
  photoUrls: z.array(z.string()).default([]),
  vehicleIds: z.array(z.string()).default([]),
  items: z.array(z.object({
    kitItemId: z.string(),
    quantity: z.number().int().min(1).optional(),
    inventoryUnitId: z.string().optional(),
  })).default([]),
})

const TRANSFER_INCLUDE = {
  fromRig: { include: { operator: { select: { id: true, name: true } } } },
  toOperator: { select: { id: true, name: true } },
  initiatedBy: { select: { id: true, name: true } },
  vehicles: { include: { vehicle: { select: { id: true, name: true, type: true } } } },
  items: {
    include: {
      kitItem: {
        include: { item: { select: { id: true, name: true } } },
      },
    },
  },
} as const

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const rig = await prisma.rig.findUnique({
    where: { id },
    include: {
      vehicles: { where: { removedAt: null } },
      kits: { include: { items: { where: { removedAt: null } } } },
    },
  })
  if (!rig) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.role !== 'ADMIN' && rig.operatorId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (rig.endedAt) return NextResponse.json({ error: 'Deployment has ended' }, { status: 409 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { toOperatorId, note, photoUrls, vehicleIds, items } = parsed.data

  if (vehicleIds.length === 0 && items.length === 0) {
    return NextResponse.json({ error: 'Select at least one vehicle or item to transfer' }, { status: 400 })
  }

  if (toOperatorId === rig.operatorId) {
    return NextResponse.json({ error: 'Cannot transfer to the same operator' }, { status: 400 })
  }

  // Verify all vehicleIds belong to this rig's active vehicles
  if (vehicleIds.length > 0) {
    const activeVehicleIds = new Set(rig.vehicles.map((rv) => rv.vehicleId))
    const invalid = vehicleIds.filter((vid) => !activeVehicleIds.has(vid))
    if (invalid.length > 0) {
      return NextResponse.json({ error: 'One or more vehicles are not in this rig' }, { status: 400 })
    }
  }

  // Verify all item kitItemIds belong to this rig's active kit items
  if (items.length > 0) {
    const activeKitItemIds = new Set(rig.kits.flatMap((k) => k.items.map((ki) => ki.id)))
    const invalid = items.filter((i) => !activeKitItemIds.has(i.kitItemId))
    if (invalid.length > 0) {
      return NextResponse.json({ error: 'One or more items are not in this rig\'s kit' }, { status: 400 })
    }
  }

  const transferRequest = await prisma.$transaction(async (tx) => {
    return tx.transferRequest.create({
      data: {
        fromRigId: id,
        toOperatorId,
        initiatedById: session.userId,
        note,
        photoUrls,
        status: 'PENDING',
        vehicles: {
          create: vehicleIds.map((vehicleId) => ({ vehicleId })),
        },
        items: {
          create: items.map((i) => ({
            kitItemId: i.kitItemId,
            quantity: i.quantity,
            inventoryUnitId: i.inventoryUnitId,
          })),
        },
      },
      include: TRANSFER_INCLUDE,
    })
  })

  return NextResponse.json(transferRequest, { status: 201 })
}
