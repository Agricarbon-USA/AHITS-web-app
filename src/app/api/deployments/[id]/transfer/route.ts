import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { isAuthorizedForRig } from '@/lib/deployment-auth'
import { getActivePrimaryForRig } from '@/lib/deployment-assignments'
import { requireAuth } from '@/lib/auth/session'
import { withIdempotency } from '@/lib/idempotency'

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

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withIdempotency(req, 'deployments.transfer.POST', () => _POST(req, ctx))
}

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
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
  if (!(await isAuthorizedForRig(rig, session))) {
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

  // W0-10 PR-1: self-transfer guard vs the deployment's PRIMARY (roster + legacy fallback).
  const primaryId = (await getActivePrimaryForRig(id)) ?? rig.operatorId
  if (toOperatorId === primaryId) {
    return NextResponse.json({ error: 'Cannot transfer to the same operator' }, { status: 400 })
  }

  // Validate the destination operator exists and is active. Without this a
  // transfer to a nonexistent id throws an FK error (unhandled 500) and a
  // transfer to a deactivated user strands the items in a ghost rig that user
  // can never log in to end.
  const toOperator = await prisma.user.findUnique({
    where: { id: toOperatorId },
    select: { id: true, isActive: true, role: true },
  })
  if (!toOperator || !toOperator.isActive) {
    return NextResponse.json({ error: 'Destination operator not found or inactive' }, { status: 400 })
  }
  if (toOperator.role !== 'OPERATOR') {
    return NextResponse.json({ error: 'Transfers can only be sent to an operator' }, { status: 400 })
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
    const created = await tx.transferRequest.create({
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

    // Notify the destination operator so they learn of the incoming transfer
    // via the bell + My-Rig badge, instead of only by polling My Rig (UX-2).
    // Created in-transaction so a transfer always has its notification.
    const counts: string[] = []
    if (vehicleIds.length > 0) counts.push(`${vehicleIds.length} vehicle${vehicleIds.length > 1 ? 's' : ''}`)
    if (items.length > 0) counts.push(`${items.length} item${items.length > 1 ? 's' : ''}`)
    await tx.notification.create({
      data: {
        userId: toOperatorId,
        type: 'TRANSFER_REQUESTED',
        title: 'Incoming equipment transfer',
        body: `${session.name} wants to transfer ${counts.join(' and ')} to you. Tap to review.`,
        link: '/operator/my-deployment',
      },
    })

    return created
  })

  return NextResponse.json(transferRequest, { status: 201 })
}
