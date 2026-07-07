import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { withIdempotency } from '@/lib/idempotency'
import { resolveStatusLink, applyTransition, hashToken, isLinkActionable } from '@/lib/status-links'
import { setLineFulfillment } from '@/lib/deployment-requests'
import { prisma } from '@/lib/prisma'

// Per-line checklist action: Confirm / Edit / Deny one line.
const lineActionSchema = z.object({
  lineId: z.string().min(1),
  action: z.enum(['confirm', 'edit', 'deny']),
  actorLabel: z.string().min(1, 'Please enter your name'),
  fulfilledQty: z.number().int().positive().optional(),
  resolvedUnitId: z.string().optional(),
  substitutedItemId: z.string().optional(),
  denyReason: z.string().optional(),
  stagedCondition: z.string().optional(),
  note: z.string().optional(),
})

// Whole-request action: Stage (PREPARED) or Decline the request.
const requestActionSchema = z.object({
  action: z.string().min(1),
  actorLabel: z.string().min(1, 'Please enter your name'),
  note: z.string().optional(),
})

// Public, token-gated transition. Idempotent (a double-tap / email prefetch can't
// double-apply) and rate-limited.
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  return withIdempotency(req, 'statuslink.transition.POST', () => _POST(req, ctx))
}

async function _POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const ip = clientIp(req)
  const rl = await rateLimit(`statuslink:${ip}`, 60, 5 * 60 * 1000)
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

  const body = await req.json().catch(() => ({}))

  // Route on lineId: per-line checklist action vs. whole-request action.
  if (body.lineId) {
    const parsed = lineActionSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { lineId, action, actorLabel, ...lineFields } = parsed.data

    // FND-6: gate the per-line action on link actionability — the same check the
    // whole-request branch applies via applyTransition. Without it, a superseded,
    // revoked, or expired link could still confirm/edit/deny a line for as long as
    // the request stayed REQUESTED, defeating the resend-revokes-old-link guarantee.
    const link = await resolveStatusLink(token)
    if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!isLinkActionable(link)) {
      return NextResponse.json({ error: 'This link is no longer active.' }, { status: 409 })
    }

    // Token-scoped ownership check: lineId must belong to the request this token
    // controls. The state/expiry predicate is repeated in SQL as defense in depth.
    const tokenHash = hashToken(token)
    const ownership = await prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*)::bigint AS cnt
      FROM "deployment_request_lines" drl
      JOIN "status_links" sl ON sl."deploymentRequestId" = drl."requestId"
      WHERE drl."id" = ${lineId} AND sl."tokenHash" = ${tokenHash}
        AND sl."state" NOT IN ('REVOKED', 'COMPLETED', 'EXPIRED')
        AND sl."expiresAt" > now()
    `
    if (Number(ownership[0]?.cnt ?? 0) === 0) {
      return NextResponse.json({ error: 'Line not found.' }, { status: 404 })
    }

    const status: 'CONFIRMED' | 'EDITED' | 'DENIED' =
      action === 'confirm' ? 'CONFIRMED' : action === 'edit' ? 'EDITED' : 'DENIED'

    const result = await setLineFulfillment(lineId, {
      status,
      fulfilledQty: lineFields.fulfilledQty,
      resolvedUnitId: lineFields.resolvedUnitId,
      substitutedItemId: lineFields.substitutedItemId,
      denyReason: lineFields.denyReason,
      stagedCondition: lineFields.stagedCondition,
      note: lineFields.note,
      actor: { label: actorLabel },
    })

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // Whole-request action (PREPARED = stage, DECLINED = decline).
  const parsed = requestActionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const link = await resolveStatusLink(token)
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await applyTransition(link, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ ok: true, state: result.state })
}
