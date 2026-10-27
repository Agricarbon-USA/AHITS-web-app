import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { photoUrlsField, isPhotoNotUploadedError } from '@/lib/validation'
import { prisma } from '@/lib/prisma'
import { claimActiveRig, isAuthorizedForRig } from '@/lib/deployment-auth'
import { getActivePrimaryForRig, hydrateTransfersFromRig } from '@/lib/deployment-assignments'
import { deploymentWriteConflict, lockKitItems, transferRecipientProblem, waitingMessage, waitingTransfersForRig, WaitingConflict } from '@/lib/dispositions'
import { requireAuth } from '@/lib/auth/session'
import { withIdempotency } from '@/lib/idempotency'
import { recordLink } from '@/lib/alerts'

const schema = z.object({
  // P1-1a (2.1, D52 §0-a/b): the note is optional (the column stays NOT NULL, so a
  // missing note is stored as ''), and a missing person is a plain 400 from 2.2's rule.
  toOperatorId: z.string().optional(),
  note: z.string().optional().default(''),
  photoUrls: photoUrlsField(), // CC-29 item 7b: reject unresolved localphoto: refs (422)
  vehicleIds: z.array(z.string()).default([]),
  items: z.array(z.object({
    kitItemId: z.string(),
    quantity: z.number().int().min(1).optional(),
    inventoryUnitId: z.string().optional(),
  })).default([]),
})

const TRANSFER_INCLUDE = {
  fromRig: true,
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
      vehicles: { where: { removedAt: null }, include: { vehicle: { select: { name: true } } } },
      kits: { include: { items: { where: { removedAt: null }, include: { item: { select: { name: true } } } } } },
    },
  })
  if (!rig) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await isAuthorizedForRig(rig, session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (rig.endedAt) return NextResponse.json({ error: 'This deployment has already ended.' }, { status: 409 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: isPhotoNotUploadedError(parsed.error) ? 422 : 400 }) // CC-29 item 7b: localphoto ref -> 422

  const { toOperatorId, note, photoUrls, vehicleIds, items } = parsed.data

  if (vehicleIds.length === 0 && items.length === 0) {
    return NextResponse.json({ error: 'Select at least one vehicle or item to transfer' }, { status: 400 })
  }

  // P1-1a (2.2): one recipient rule for every transfer path. The primary is read
  // nullable — a racing End may have closed the roster (the helper then says so).
  const problem = await transferRecipientProblem([{ toOperatorId, name: null }], await getActivePrimaryForRig(id))
  if (problem) return NextResponse.json({ error: problem.error }, { status: problem.status })
  const recipientId = toOperatorId as string

  const lines = new Map(rig.kits.flatMap((k) => k.items).map((ki) => [ki.id, ki]))

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
    // P1-1a (2.1): a line's quantity can't exceed what is on the line.
    for (const i of items) {
      const line = lines.get(i.kitItemId)!
      if (i.quantity != null && i.quantity > line.quantity) {
        return NextResponse.json({ error: `Only ${line.quantity} of "${line.item.name}" are on this deployment.` }, { status: 400 })
      }
    }
  }

  let transferRequest
  try {
  transferRequest = await prisma.$transaction(async (tx) => {
    // P1-1a (2.5): the deployment first, then its lines (2.8's lock orders the writes).
    await claimActiveRig(tx, id)
    await lockKitItems(tx, items.map((i) => i.kitItemId), { skipClosed: false })
    // P1-1a (2.8, §0-s): gear already waiting on a transfer stays with that transfer.
    const waiting = await waitingTransfersForRig(id, tx)
    for (const i of items) {
      const w = waiting.items.get(i.kitItemId)
      if (w) throw new WaitingConflict(waitingMessage(lines.get(i.kitItemId)?.item.name ?? 'This equipment', w.toName))
    }
    for (const vehicleId of vehicleIds) {
      const w = waiting.vehicles.get(vehicleId)
      if (w) {
        const name = rig.vehicles.find((rv) => rv.vehicleId === vehicleId)?.vehicle.name ?? 'This vehicle'
        throw new WaitingConflict(waitingMessage(name, w.toName))
      }
    }
    const created = await tx.transferRequest.create({
      data: {
        fromRigId: id,
        toOperatorId: recipientId,
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
        userId: recipientId,
        type: 'TRANSFER_REQUESTED',
        title: 'Incoming equipment transfer',
        body: `${session.name} wants to transfer ${counts.join(' and ')} to you. Tap to review.`,
        // PR-4 (P-8): the id in the link lets accept/decline/cancel mark this read.
        link: recordLink('/operator/my-deployment', 'transfer_requests', created.id),
      },
    })

    return created
  })
  } catch (err) {
    const conflict = deploymentWriteConflict(err)
    if (conflict) return NextResponse.json(conflict, { status: 409 })
    console.error('[POST /api/deployments/[id]/transfer]', err)
    return NextResponse.json({ error: 'Transfer failed. Try again.' }, { status: 500 })
  }

  // W0-10 PR-4: hydrate the source-rig operator (successor to the dropped fromRig.operator include).
  return NextResponse.json((await hydrateTransfersFromRig([transferRequest]))[0], { status: 201 })
}
