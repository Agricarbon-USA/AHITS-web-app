import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { withIdempotency } from '@/lib/idempotency'
import { ensureOpenAssignment, endAllAssignmentsForRig, removeAllProjectLinks } from '@/lib/deployment-assignments'

const schema = z.object({
  responseNote: z.string().optional(),
})

// Accepting a transfer moves vehicles/units and writes CheckLogs — a replay
// (e.g. an offline double-tap) must not double-apply. Wrap in withIdempotency.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withIdempotency(req, 'transfers.accept.POST', () => _POST(req, ctx))
}

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const transfer = await prisma.transferRequest.findUnique({
    where: { id },
    include: {
      fromRig: {
        select: {
          id: true,
          operatorId: true,
          endedAt: true,
          operator: { select: { id: true, name: true } },
        },
      },
      vehicles: true,
      items: { include: { kitItem: { select: { id: true, inventoryItemId: true, quantity: true, inventoryUnitId: true, removedAt: true } } } },
    },
  })
  if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (transfer.status !== 'PENDING') {
    return NextResponse.json({ error: 'Transfer is no longer pending' }, { status: 409 })
  }

  const isDestination = transfer.toOperatorId === session.userId
  const isAdmin = session.role === 'ADMIN'
  if (!isDestination && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { responseNote } = parsed.data

  const now = new Date()
  const toOperatorId = transfer.toOperatorId
  const sourceName = transfer.fromRig.operator.name

  let updatedTransfer
  try {
    updatedTransfer = await prisma.$transaction(async (tx) => {
    // Claim-first: atomically flip PENDING → ACCEPTED before doing any moves.
    // Two concurrent accepts (e.g. the destination operator and an admin) both
    // pass the pre-transaction status check at line 38; this conditional UPDATE
    // serializes them on the row lock and the loser matches 0 rows, so only one
    // transaction performs the vehicle/unit moves and CheckLog writes. If any
    // later guard throws, the whole transaction rolls back and status reverts.
    const claim = await tx.transferRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'ACCEPTED',
        respondedAt: now,
        responseNote: isAdmin && !isDestination
          ? `Accepted by admin ${session.name}${responseNote ? `: ${responseNote}` : ''}`
          : responseNote ?? null,
      },
    })
    if (claim.count === 0) {
      throw new Error('Transfer is no longer pending')
    }

    // NOTE: We intentionally do NOT block on sourceRig.endedAt — end-of-deployment
    // TRANSFER dispositions leave the source rig ended with items still pending transfer.

    // Guard: verify each vehicle is still in the source rig (not double-transferred)
    for (const tv of transfer.vehicles) {
      const stillPresent = await tx.rigVehicle.findFirst({
        where: { rigId: transfer.fromRig.id, vehicleId: tv.vehicleId, removedAt: null },
      })
      if (!stillPresent) {
        throw new Error(`Vehicle is no longer in the source deployment`)
      }
    }

    // Guard: verify each kit item is still in the source rig (not double-transferred).
    // Allow items from ended rigs — those were intentionally kept pending via the TRANSFER path.
    for (const ti of transfer.items) {
      const stillPresent = await tx.kitItem.findFirst({
        where: {
          id: ti.kitItemId,
          OR: [
            { removedAt: null },
            { kit: { rig: { id: transfer.fromRig.id, endedAt: { not: null } } } },
          ],
        },
      })
      if (!stillPresent) {
        throw new Error(`Kit item is no longer in the source deployment`)
      }
      if (ti.quantity != null && stillPresent.quantity < ti.quantity) {
        throw new Error(`Insufficient quantity remaining for a kit item`)
      }
    }

    // Find or create destination rig (source rig stays active regardless)
    let destRig = await tx.rig.findFirst({
      where: { operatorId: toOperatorId, endedAt: null },
    })
    if (!destRig) {
      destRig = await tx.rig.create({
        data: { operatorId: toOperatorId, startedAt: now },
      })
      await ensureOpenAssignment({ rigId: destRig.id, operatorId: toOperatorId, role: 'PRIMARY', addedById: session.userId, note: 'Created on transfer accept' }, tx)
    }

    // Find or create destination kit
    let destKit = await tx.kit.findFirst({ where: { rigId: destRig.id } })
    if (!destKit) {
      destKit = await tx.kit.create({ data: { rigId: destRig.id } })
    }

    // Transfer vehicles (only removes transferred ones — source deployment stays active)
    for (const tv of transfer.vehicles) {
      await tx.rigVehicle.updateMany({
        where: { rigId: transfer.fromRig.id, vehicleId: tv.vehicleId, removedAt: null },
        data: { removedAt: now, removeNote: transfer.note },
      })
      await tx.rigVehicle.create({
        data: {
          rigId: destRig.id,
          vehicleId: tv.vehicleId,
          addNote: `Accepted transfer from ${sourceName}`,
          photoUrls: transfer.photoUrls,
        },
      })
      await tx.vehicle.update({
        where: { id: tv.vehicleId },
        data: { assignedOperatorId: toOperatorId },
      })
    }

    // Transfer kit items (partial or full — remaining items stay in source rig)
    for (const ti of transfer.items) {
      const transferQty = ti.quantity ?? ti.kitItem.quantity
      const currentKitItem = await tx.kitItem.findUnique({ where: { id: ti.kitItemId } })
      const currentQty = currentKitItem?.quantity ?? ti.kitItem.quantity

      // Carry the drawn-from-hub accounting onto the destination kit item (FND-2).
      // drawnQuantity/drawnHubId record how much consumable stock was drawn from a
      // hub at check-out; a later HUB return restores min(removeQty, drawnQuantity)
      // to drawnHubId. Previously the destination item was created with
      // drawnQuantity:0/drawnHubId:null, so every post-transfer return restored 0 —
      // silently losing the drawn stock from inventory. Split the drawn amount so
      // the total is conserved: the destination takes up to the transferred qty, the
      // source keeps the remainder. (Serialized items have drawnQuantity 0 → no-op.)
      const sourceDrawn = currentKitItem?.drawnQuantity ?? 0
      const destDrawnQuantity = Math.min(transferQty, sourceDrawn)
      const destDrawnHubId = destDrawnQuantity > 0 ? (currentKitItem?.drawnHubId ?? null) : null

      // Mark source kit item removed (even if already removedAt is set on ended-rig transfers)
      if (transferQty >= currentQty) {
        await tx.kitItem.update({
          where: { id: ti.kitItemId },
          data: { removedAt: now },
        })
      } else {
        await tx.kitItem.update({
          where: { id: ti.kitItemId },
          // Source keeps the un-transferred share of the drawn stock so it can't
          // over-restore stock it no longer holds.
          data: { quantity: currentQty - transferQty, drawnQuantity: sourceDrawn - destDrawnQuantity },
        })
      }
      await tx.kitItem.create({
        data: {
          kitId: destKit.id,
          inventoryItemId: ti.kitItem.inventoryItemId,
          quantity: transferQty,
          inventoryUnitId: ti.inventoryUnitId ?? ti.kitItem.inventoryUnitId ?? null,
          drawnQuantity: destDrawnQuantity,
          drawnHubId: destDrawnHubId,
        },
      })
      await tx.checkLog.create({
        data: {
          action: 'CHECK_IN',
          itemId: ti.kitItem.inventoryItemId,
          inventoryUnitId: ti.inventoryUnitId ?? ti.kitItem.inventoryUnitId ?? undefined,
          operatorId: transfer.fromRig.operatorId,
          rigId: transfer.fromRig.id,
          notes: transfer.note,
        },
      })
      await tx.checkLog.create({
        data: {
          action: 'CHECK_OUT',
          itemId: ti.kitItem.inventoryItemId,
          inventoryUnitId: ti.inventoryUnitId ?? ti.kitItem.inventoryUnitId ?? undefined,
          operatorId: toOperatorId,
          rigId: destRig.id,
          notes: 'Accepted transfer',
        },
      })
    }

    // Auto-end source deployment if now completely empty
    const remainingVehicles = await tx.rigVehicle.count({
      where: { rigId: transfer.fromRig.id, removedAt: null },
    })
    const sourceKits = await tx.kit.findMany({
      where: { rigId: transfer.fromRig.id },
      select: { items: { where: { removedAt: null }, select: { id: true } } },
    })
    const remainingItems = sourceKits.reduce((sum, k) => sum + k.items.length, 0)
    if (remainingVehicles === 0 && remainingItems === 0 && !transfer.fromRig.endedAt) {
      await tx.rig.update({ where: { id: transfer.fromRig.id }, data: { endedAt: now } })
      await endAllAssignmentsForRig(transfer.fromRig.id, tx)
      await removeAllProjectLinks(transfer.fromRig.id, tx)
    }

      // Status/respondedAt/responseNote were already written by the claim above.
      return tx.transferRequest.findUnique({ where: { id } })
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Transfer failed'
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  // Notify the initiator their transfer was accepted (best-effort, non-fatal).
  if (transfer.initiatedById && transfer.initiatedById !== session.userId) {
    await prisma.notification.create({
      data: {
        userId: transfer.initiatedById,
        type: 'TRANSFER_ACCEPTED',
        title: 'Transfer accepted',
        body: `${session.name} accepted the equipment transfer.`,
        link: '/operator/my-rig',
      },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, transferRequest: updatedTransfer })
}
