import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { getHandoff } from '@/lib/deployment-handoffs'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const handoff = await getHandoff(id)
  if (!handoff) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (handoff.status !== 'PENDING') return NextResponse.json({ error: 'Handoff is no longer pending' }, { status: 409 })

  const isInitiator = handoff.initiatedById === session.userId
  const isAdmin = session.role === 'ADMIN'
  if (!isInitiator && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()
  const cancelled = await prisma.$executeRaw`
    UPDATE "deployment_handoffs"
    SET "status" = 'CANCELLED', "updatedAt" = ${now}
    WHERE "id" = ${id} AND "status" = 'PENDING'`

  if (Number(cancelled) === 0) {
    return NextResponse.json({ error: 'Handoff is no longer pending' }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}
