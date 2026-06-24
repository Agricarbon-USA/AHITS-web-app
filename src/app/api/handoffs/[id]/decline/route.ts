import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { withIdempotency } from '@/lib/idempotency'
import { getHandoff } from '@/lib/deployment-handoffs'

const schema = z.object({
  responseNote: z.string().optional(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withIdempotency(req, 'handoffs.decline.POST', () => _POST(req, ctx))
}

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const handoff = await getHandoff(id)
  if (!handoff) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (handoff.status !== 'PENDING') return NextResponse.json({ error: 'Handoff is no longer pending' }, { status: 409 })

  const isRecipient = handoff.toOperatorId === session.userId
  const isAdmin = session.role === 'ADMIN'
  if (!isRecipient && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { responseNote } = parsed.data

  const now = new Date()

  try {
    await prisma.$transaction(async (tx) => {
      const claim = await tx.$executeRaw`
        UPDATE "deployment_handoffs"
        SET "status" = 'DECLINED', "respondedAt" = ${now}, "responseNote" = ${responseNote ?? null}, "updatedAt" = ${now}
        WHERE "id" = ${id} AND "status" = 'PENDING'`
      if (Number(claim) === 0) throw new Error('Handoff is no longer pending')
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Decline failed'
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  if (handoff.initiatedById && handoff.initiatedById !== session.userId) {
    await prisma.notification.create({
      data: {
        userId: handoff.initiatedById,
        type: 'HANDOFF_DECLINED',
        title: 'Deployment handoff declined',
        body: `${session.name} declined the deployment handoff${responseNote ? `: ${responseNote}` : ''}.`,
        link: '/operator/my-rig',
      },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
