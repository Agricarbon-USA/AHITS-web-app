import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { withIdempotency } from '@/lib/idempotency'
import { writeAudit } from '@/lib/audit'
import { getActivePrimaryForRig, getRequiredPrimaryForRig, getActiveRigForOperator } from '@/lib/deployment-assignments'
import { reassignPrimary, createHandoff } from '@/lib/deployment-handoffs'

// CC-32 (2.3): the handoff note is OPTIONAL — mandatory typing at every end-of-day
// handoff bought nothing the roster already records. Relaxed server-side in the same
// PR as the client (the CC-24 item-4 precedent), otherwise the client change 400s.
// Defaulted to '' rather than made nullable: deployment_handoffs."note" is TEXT NOT
// NULL, so this needs no schema change and no migration.
const schema = z.object({
  toOperatorId: z.string(),
  note: z.string().optional().default(''),
  force: z.boolean().optional(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withIdempotency(req, 'deployments.handoff.POST', () => _POST(req, ctx))
}

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const rig = await prisma.rig.findUnique({ where: { id }, select: { id: true, endedAt: true } })
  if (!rig) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (rig.endedAt) return NextResponse.json({ error: 'Deployment has ended' }, { status: 409 })

  const isAdmin = session.role === 'ADMIN'
  // W0-10 PR-1: PRIMARY-only — roster-PRIMARY (+ legacy fallback); primaryId reused below.
  const primaryId = await getRequiredPrimaryForRig(id)
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
  // D3: an admin may hold a rig (admin-as-operator), so admins are a valid handoff
  // target alongside operators; excluded from the money loop downstream, not here.
  if (!target || !target.isActive || (target.role !== 'OPERATOR' && target.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Target must be an active operator or admin' }, { status: 400 })
  }

  const force = isAdmin && forceRaw === true
  const fromOperatorId = primaryId

  let handoffId: string
  try {
    handoffId = await prisma.$transaction(async (tx) => {
      const targetActive = await getActiveRigForOperator(toOperatorId, tx)
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
