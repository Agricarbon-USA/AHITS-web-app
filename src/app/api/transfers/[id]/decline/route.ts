import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { withIdempotency } from '@/lib/idempotency'

const schema = z.object({
  responseNote: z.string().optional(),
})

// Declining can restore units for an ended-rig transfer and writes CheckLogs —
// guard against replay double-application.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withIdempotency(req, 'transfers.decline.POST', () => _POST(req, ctx))
}

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const transfer = await prisma.transferRequest.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          kitItem: {
            select: { id: true, inventoryItemId: true, inventoryUnitId: true, quantity: true, removedAt: true },
          },
        },
      },
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

  try {
    await prisma.$transaction(async (tx) => {
    // Claim-first: only one concurrent decline/accept/cancel may win the flip.
    const claim = await tx.transferRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'DECLINED', respondedAt: now, responseNote: responseNote ?? null },
    })
    if (claim.count === 0) {
      throw new Error('Transfer is no longer pending')
    }

    // For end-of-deployment transfers (source rig ended), restore units and mark kit items removed.
    // For active-rig transfers, items stay in the source kit unchanged.
    const sourceRig = await tx.rig.findUnique({
      where: { id: transfer.fromRigId },
      select: { endedAt: true },
    })
    if (sourceRig?.endedAt) {
      for (const ti of transfer.items) {
        const kitItem = ti.kitItem
        if (kitItem.removedAt) continue

        await tx.kitItem.update({ where: { id: kitItem.id }, data: { removedAt: now } })

        if (kitItem.inventoryUnitId) {
          await tx.inventoryUnit.update({
            where: { id: kitItem.inventoryUnitId },
            data: { status: 'AVAILABLE' },
          })
        } else {
          const units = await tx.inventoryUnit.findMany({
            where: { inventoryItemId: kitItem.inventoryItemId, status: 'CHECKED_OUT' },
            take: kitItem.quantity,
          })
          if (units.length > 0) {
            await tx.inventoryUnit.updateMany({
              where: { id: { in: units.map((u) => u.id) } },
              data: { status: 'AVAILABLE' },
            })
          }
        }
        await tx.checkLog.create({
          data: {
            action: 'CHECK_IN',
            itemId: kitItem.inventoryItemId,
            inventoryUnitId: kitItem.inventoryUnitId ?? undefined,
            operatorId: session.userId,
            rigId: transfer.fromRigId,
            notes: `Transfer declined: ${responseNote ?? 'no reason given'}. Units returned to inventory.`,
          },
        })
      }
    }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Decline failed'
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  // Notify the initiator their transfer was declined (best-effort, non-fatal).
  if (transfer.initiatedById && transfer.initiatedById !== session.userId) {
    await prisma.notification.create({
      data: {
        userId: transfer.initiatedById,
        type: 'TRANSFER_DECLINED',
        title: 'Transfer declined',
        body: `${session.name} declined the equipment transfer${responseNote ? `: ${responseNote}` : ''}.`,
        link: '/operator/my-deployment',
      },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
