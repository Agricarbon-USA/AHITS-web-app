import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { withIdempotency } from '@/lib/idempotency'

// Cancelling flips PENDING -> CANCELLED. Wrapped in withIdempotency so an offline
// replay (the My Rig cancel now routes through the offline queue) applies once.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withIdempotency(req, 'transfers.cancel.DELETE', () => _DELETE(req, ctx))
}

async function _DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const transfer = await prisma.transferRequest.findUnique({ where: { id } })
  if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (transfer.status !== 'PENDING') {
    return NextResponse.json({ error: 'Transfer is no longer pending' }, { status: 409 })
  }

  // Only admin or the initiator can cancel
  if (session.role !== 'ADMIN' && transfer.initiatedById !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Atomic compare-and-set (DAT-3): only the request that flips PENDING wins;
  // a concurrent accept/decline/cancel that already moved it gets a 409.
  const claim = await prisma.transferRequest.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  })
  if (claim.count === 0) {
    return NextResponse.json({ error: 'Transfer is no longer pending' }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}
