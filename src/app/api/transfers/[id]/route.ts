import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
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

  await prisma.transferRequest.update({
    where: { id },
    data: { status: 'CANCELLED' },
  })

  return NextResponse.json({ ok: true })
}
