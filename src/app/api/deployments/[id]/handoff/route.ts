import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { withIdempotency } from '@/lib/idempotency'
import { writeAudit } from '@/lib/audit'
import { getActivePrimaryForRig } from '@/lib/deployment-assignments'
import { reassignPrimary, createHandoff } from '@/lib/deployment-handoffs'

const schema = z.object({
  toOperatorId: z.string(),
  note: z.string().min(1, 'Note is required'),
  force: z.boolean().optional(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withIdempotency(req, 'deployments.handoff.POST', () => _POST(req, ctx))
}

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const rig = await prisma.rig.findUnique({ where: { id }, select: { id: true, operatorId: true, endedAt: true } })
  if (!rig) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (rig.endedAt) return NextResponse.json({ error: 'Deployment has ended' }, { status: 409 })

  const isAdmin = session.role === 'ADMIN'
  // W0-10 PR-1: PRIMARY-only — roster-PRIMARY (+ legacy fallback); primaryId reused below.
  const primaryId = (await getActivePrimaryForRig(id)) ?? rig.operatorId
  const isPrimary = primaryId === session.userId
  if (!isAdmin && !isPrimary) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { toOperatorId, note, force: forceRaw } = parsed.data

  if (toOperatorId === primaryId) {
    return NextResponse.json({ error: 'That operator is already the primary operator' }, { status: 409 })
  }

  const target = await prisma.user.findUnique({ where: { id: toOperatorId }, select: { id: true, isActive: true, role: true } })
  if (!target || !target.isActive || target.role !== 'OPERATOR') {
    return NextResponse.json({ error: 'Target must be an active operator' }, { status: 400 })
  }

  const force = isAdmin && forceRaw === true
  const fromOperatorId = primaryId

  let handoffId: string
  try {
    handoffId = await prisma.$transaction(async (tx) => {
      const targetActive = await tx.rig.findFirst({ where: { operatorId: toOperatorId, endedAt: null } })
      if (targetActive) throw new Error('TARGET_HAS_ACTIVE_RIG')

      if (force) {
        await reassignPrimary(tx, rig, toOperatorId, session.userId, note)
        return createHandoff({ rigId: id, fromOperatorId, toOperatorId, initiatedById: session.userId, note, status: 'ACCEPTED', respondedAt: new Date() })
      }

      return createHandoff({ rigId: id, fromOperatorId, toOperatorId, initiatedById: session.userId, note })
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Handoff failed'
    if (msg === 'TARGET_HAS_ACTIVE_RIG') {
      return NextResponse.json({ error: 'That operator already has an active deployment' }, { status: 409 })
    }
    if ((err as { code?: string }).code === 'P2002' || (err as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'A handoff is already pending for this deployment' }, { status: 409 })
    }
    console.error('[POST /api/deployments/[id]/handoff]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  if (force) {
    await writeAudit(session.userId, 'DEPLOYMENT_HANDOFF', fromOperatorId, { rigId: id, toOperatorId, forced: true })
  } else {
    await prisma.notification.create({
      data: {
        userId: toOperatorId,
        type: 'HANDOFF_REQUESTED',
        title: 'Deployment handoff requested',
        body: `${session.name} wants to hand off a deployment to you.`,
        link: '/operator/my-deployment',
      },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, handoffId }, { status: 201 })
}
