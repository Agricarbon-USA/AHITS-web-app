import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  // Conditional flip so a cancel racing an accept/decline can't override a
  // already-resolved transfer.
  const cancelled = await prisma.transferRequest.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  })
  if (cancelled.count === 0) {
    return NextResponse.json({ error: 'Transfer is no longer pending' }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}
