import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const transfer = await prisma.transferRequest.findUnique({
    where: { id },
    include: { fromRig: true },
  })
  if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (transfer.status !== 'PENDING') {
    return NextResponse.json({ error: 'Transfer is no longer pending' }, { status: 409 })
  }

  const isInitiator = transfer.initiatedById === session.userId
  const isAdmin = session.role === 'ADMIN'
  if (!isInitiator && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.transferRequest.update({
    where: { id },
    data: {
      status: 'DECLINED',
      responseNote: 'Cancelled by sender',
      respondedAt: new Date(),
    },
  })

  return NextResponse.json({ ok: true })
}
