import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { withIdempotency } from '@/lib/idempotency'
import { writeAudit } from '@/lib/audit'
import { getActivePrimaryForRig, getActiveRigForOperator } from '@/lib/deployment-assignments'
import { reassignPrimary, createHandoff, cancelPendingHandoffs, getPendingHandoffForRig } from '@/lib/deployment-handoffs'
import { recordLink, resolveAlertsFor } from '@/lib/alerts'
import { claimActiveRig, DeploymentEnded } from '@/lib/deployment-auth'
import { deploymentWriteConflict, transferRecipientProblem } from '@/lib/dispositions'
import { isUniqueViolationAnywhere } from '@/lib/api-errors'

// CC-32 (2.3): the handoff note is OPTIONAL — mandatory typing at every end-of-day
// handoff bought nothing the roster already records. Relaxed server-side in the same
// PR as the client (the CC-24 item-4 precedent), otherwise the client change 400s.
// Defaulted to '' rather than made nullable: deployment_handoffs."note" is TEXT NOT
// NULL, so this needs no schema change and no migration.
const schema = z.object({
  toOperatorId: z.string().optional(), // P1-1a (2.2): a missing person is a plain 400
  note: z.string().optional().default(''),
  force: z.boolean().optional(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withIdempotency(req, 'deployments.handoff.POST', () => _POST(req, ctx))
}

const pendingMessage = (name: string) => `This deployment already has a transfer waiting for ${name} to answer. Cancel it first.`

/** P1-1a (2.3): a second waiting transfer of the same deployment. */
class PendingTransfer extends Error {}

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const rig = await prisma.rig.findUnique({ where: { id }, select: { id: true, endedAt: true } })
  if (!rig) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (rig.endedAt) return NextResponse.json({ error: 'This deployment has already ended.' }, { status: 409 })

  const isAdmin = session.role === 'ADMIN'
  // W0-10 PR-1: PRIMARY-only — roster-PRIMARY; primaryId reused below. P1-1a (2.2): read
  // nullable, since a racing End may have closed the roster (the rule then says so).
  const primaryId = await getActivePrimaryForRig(id)
  const isPrimary = primaryId === session.userId
  if (!isAdmin && !isPrimary) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { toOperatorId, note, force: forceRaw } = parsed.data

  const problem = await transferRecipientProblem([{ toOperatorId, name: null }], primaryId)
  if (problem) return NextResponse.json({ error: problem.error }, { status: problem.status })
  const recipientId = toOperatorId as string

  const force = isAdmin && forceRaw === true

  let result: {
    handoffId: string
    fromOperatorId: string
    cancelled: { toOperatorId: string; toOperatorName: string }[]
  }
  try {
    result = await prisma.$transaction(async (tx) => {
      // P1-1a (2.5): the deployment first.
      await claimActiveRig(tx, id)

      const targetActive = await getActiveRigForOperator(recipientId, tx)
      if (targetActive) throw new Error('TARGET_HAS_ACTIVE_RIG')

      if (force) {
        // §0-c: an admin Reassign cancels every transfer from this deployment still waiting
        // for an answer. Re-read the primary after the claim — a transfer accept may have
        // committed just before.
        const fromOperatorId = await getActivePrimaryForRig(id, tx)
        if (!fromOperatorId) throw new DeploymentEnded()
        const handoffs = await cancelPendingHandoffs(id, tx)
        // Raw RETURNING, so a transfer accepted in between is never told it was cancelled.
        const transfers = await tx.$queryRaw<{ id: string; toOperatorId: string; toOperatorName: string }[]>`
          WITH c AS (
            UPDATE "transfer_requests" SET "status" = 'CANCELLED', "updatedAt" = now()
            WHERE "fromRigId" = ${id} AND "status" = 'PENDING'
            RETURNING "id", "toOperatorId")
          SELECT c.*, u."name" AS "toOperatorName" FROM c JOIN "users" u ON u."id" = c."toOperatorId"`
        for (const row of transfers) await resolveAlertsFor('transfer_requests', row.id, tx)
        await reassignPrimary(tx, rig, recipientId, session.userId, note)
        const handoffId = await createHandoff({ rigId: id, fromOperatorId, toOperatorId: recipientId, initiatedById: session.userId, note, status: 'ACCEPTED', respondedAt: new Date() }, tx)
        return { handoffId, fromOperatorId, cancelled: [...handoffs, ...transfers] }
      }

      const pending = await getPendingHandoffForRig(id, tx)
      if (pending) throw new PendingTransfer(pendingMessage(pending.toOperatorName))
      const handoffId = await createHandoff({ rigId: id, fromOperatorId: primaryId as string, toOperatorId: recipientId, initiatedById: session.userId, note }, tx)
      return { handoffId, fromOperatorId: primaryId as string, cancelled: [] }
    })
  } catch (err) {
    const conflict = deploymentWriteConflict(err)
    if (conflict) return NextResponse.json(conflict, { status: 409 })
    if (err instanceof PendingTransfer) return NextResponse.json({ error: err.message }, { status: 409 })
    if (err instanceof Error && err.message === 'TARGET_HAS_ACTIVE_RIG') {
      return NextResponse.json({ error: 'That operator already has an active deployment' }, { status: 409 })
    }
    // Race backstop (the claim makes it rarely reachable): the one-pending-per-deployment
    // index, or — on Reassign — the one-open-PRIMARY-per-operator index.
    if (isUniqueViolationAnywhere(err)) {
      if (force) {
        return NextResponse.json({ error: 'That operator just started another active deployment — refresh and try again.' }, { status: 409 })
      }
      const pending = await getPendingHandoffForRig(id).catch(() => null)
      return NextResponse.json(
        { error: pending ? pendingMessage(pending.toOperatorName) : 'Another transfer of this deployment was just started — refresh to see it.' },
        { status: 409 },
      )
    }
    console.error('[POST /api/deployments/[id]/handoff]', err)
    return NextResponse.json({ error: 'Transfer failed. Try again.' }, { status: 500 })
  }

  const { handoffId, fromOperatorId, cancelled } = result
  if (force) {
    await writeAudit(session.userId, 'DEPLOYMENT_HANDOFF', fromOperatorId, { rigId: id, toOperatorId: recipientId, forced: true })
    if (cancelled.length > 0) {
      // Each recipient once; the old operator one row naming each person once (even when
      // they are the admin doing it). The initiator isn't told separately.
      const recipients = new Map(cancelled.map((c) => [c.toOperatorId, c.toOperatorName]))
      const data = [...recipients.keys()].map((userId) => ({
        userId,
        type: 'TRANSFER_CANCELLED',
        title: 'Transfer cancelled',
        body: `${session.name} reassigned the deployment, so the transfer waiting for you was cancelled.`,
        link: '/operator/my-deployment',
      }))
      data.push({
        userId: fromOperatorId,
        type: 'TRANSFER_CANCELLED',
        title: 'Transfer cancelled',
        body: `${session.name} reassigned the deployment and cancelled the waiting transfer to ${[...new Set(recipients.values())].join(', ')}.`,
        link: '/operator/my-deployment',
      })
      await prisma.notification.createMany({ data }).catch(() => {})
    }
  } else {
    await prisma.notification.create({
      data: {
        userId: recipientId,
        type: 'HANDOFF_REQUESTED',
        title: 'Transfer requested',
        body: `${session.name} wants to transfer a deployment to you.`,
        // PR-4 (P-8): the id in the link lets accept/decline/cancel mark this read.
        link: recordLink('/operator/my-deployment', 'deployment_handoffs', handoffId),
      },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, handoffId }, { status: 201 })
}
