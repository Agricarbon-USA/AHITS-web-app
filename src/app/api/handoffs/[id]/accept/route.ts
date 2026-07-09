import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getActiveRigForOperator } from '@/lib/deployment-assignments'
import { requireAuth } from '@/lib/auth/session'
import { withIdempotency } from '@/lib/idempotency'
import { writeAudit } from '@/lib/audit'
import { getHandoff, reassignPrimary } from '@/lib/deployment-handoffs'

const schema = z.object({
  responseNote: z.string().optional(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withIdempotency(req, 'handoffs.accept.POST', () => _POST(req, ctx))
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
        SET "status" = 'ACCEPTED', "respondedAt" = ${now}, "responseNote" = ${responseNote ?? null}, "updatedAt" = ${now}
        WHERE "id" = ${id} AND "status" = 'PENDING'`
      if (Number(claim) === 0) throw new Error('Handoff is no longer pending')

      const rig = await tx.rig.findUnique({
        where: { id: handoff.rigId },
        select: { id: true, endedAt: true },
      })
      if (!rig || rig.endedAt) throw new Error('Deployment has ended')

      const targetConflict = await getActiveRigForOperator(handoff.toOperatorId, tx)
      if (targetConflict && targetConflict !== handoff.rigId) throw new Error('TARGET_HAS_ACTIVE_RIG')

      await reassignPrimary(tx, rig, handoff.toOperatorId, session.userId, handoff.note)
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Accept failed'
    if (msg === 'TARGET_HAS_ACTIVE_RIG') {
      return NextResponse.json({ error: 'That operator already has an active deployment' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  await writeAudit(session.userId, 'DEPLOYMENT_HANDOFF', handoff.fromOperatorId, { rigId: handoff.rigId, toOperatorId: handoff.toOperatorId })

  if (handoff.initiatedById && handoff.initiatedById !== session.userId) {
    await prisma.notification.create({
      data: {
        userId: handoff.initiatedById,
        type: 'HANDOFF_ACCEPTED',
        title: 'Deployment handoff accepted',
        body: `${session.name} accepted the deployment handoff.`,
        link: '/operator/my-deployment',
      },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
