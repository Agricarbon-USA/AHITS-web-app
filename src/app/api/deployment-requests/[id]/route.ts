import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/session'
import { getRequest, getLineChecklist, applyRequestTransition, type RequestAction } from '@/lib/deployment-requests'
import { createAlert } from '@/lib/alerts'
import { issueStatusLink, statusLinkUrl } from '@/lib/status-links'
import { sendEmail } from '@/lib/email/resend'
import { genericAlertEmail } from '@/lib/email/templates'
import { prisma } from '@/lib/prisma'

// CC-33 (E3): 'complete' is now ADMIN-ONLY — the operator-fulfiller path is gone (D21).
const ADMIN_ONLY_ACTIONS = ['confirm', 'prepare', 'decline', 'fulfill', 'forward', 'complete'] as const

const patchSchema = z.object({
  action: z.enum(['submit', 'cancel', 'confirm', 'prepare', 'decline', 'fulfill', 'forward', 'complete']),
  decisionNote: z.string().trim().max(2000).optional().nullable(),
  fulfillerHubId: z.string().optional().nullable(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const result = await getRequest(id)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Operators may only read their own requests or ones forwarded to them.
  if (session.role !== 'ADMIN' && result.requestedById !== session.userId && result.request.fulfillerOperatorId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // For RESERVATION requests, return full checklist data (includes availableUnits + substitutableItems).
  if (result.request.requestType === 'RESERVATION') {
    const { lines: checklistLines, progress } = await getLineChecklist(id, result.request.fulfillerHubId)
    return NextResponse.json({ data: { request: result.request, lines: checklistLines, progress } })
  }
  return NextResponse.json({ data: { request: result.request, lines: result.lines } })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { action, ...extra } = parsed.data
  const isAdminOnly = (ADMIN_ONLY_ACTIONS as readonly string[]).includes(action)

  if (isAdminOnly && session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only.' }, { status: 403 })
  }

  const result = await getRequest(id)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // CC-33 (E3): operators may only act on their OWN requests. The forwarded-to-operator
  // escape (fulfillerOperatorId === userId) is gone (D21); 'complete' is admin-only above.
  if (!isAdminOnly && session.role !== 'ADMIN' &&
      result.requestedById !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const transition = await applyRequestTransition(id, action as RequestAction, result.request.requestType, extra)
  if (!transition.ok) {
    if (transition.code === 'INSUFFICIENT_STOCK') {
      return NextResponse.json(
        { error: 'Insufficient available stock', shortItems: transition.shortItems ?? [] },
        { status: 409 },
      )
    }
    if (transition.code === 'PENDING_LINES') {
      return NextResponse.json(
        { error: 'All lines must be checked off before staging.' },
        { status: 409 },
      )
    }
    const msg = action === 'submit' ? 'Only a draft can be submitted.' : 'Transition not allowed in the current state.'
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  // Post-transition side effects (best-effort, non-blocking).
  if (action === 'submit' && result.request.requestType === 'MATERIAL') {
    await createAlert('MATERIAL_REQUEST', 'deployment_requests', id, {
      name: result.request.label ?? 'Material request',
    }).catch(() => {})
  } else if (action === 'forward') {
    // CC-33 (E3): only the forward-to-HUB link remains — the forward-to-operator
    // notification arm was removed (D21).
    if (extra.fulfillerHubId) {
      await issueForwardHubLink(id, extra.fulfillerHubId, session.userId, result.request.label).catch(() => {})
    }
  } else if (action === 'complete') {
    await prisma.notification.create({
      data: {
        userId: result.requestedById,
        type: 'RESERVATION_UPDATE',
        // CC-24: MATERIAL `complete` moves no stock — "handled", not "fulfilled".
        title: 'Your material request was handled',
        body: result.request.label
          ? `"${result.request.label}" has been marked handled.`
          : 'Your material request has been marked handled.',
        link: '/operator/requests',
      },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}

async function issueForwardHubLink(requestId: string, hubId: string, createdById: string, label: string | null): Promise<void> {
  const hubs = await prisma.$queryRaw<{ name: string; email: string | null }[]>`
    SELECT "name", "email" FROM "hubs" WHERE "id" = ${hubId}
  `
  const hub = hubs[0]
  if (!hub) return
  const { rawToken } = await issueStatusLink({
    type: 'RESERVATION',
    deploymentRequestId: requestId,
    hubId,
    createdById,
    recipientEmail: hub.email ?? undefined,
    recipientName: hub.name,
  })
  if (!hub.email) return
  const url = statusLinkUrl(rawToken)
  await sendEmail({ kind: 'RESERVATION',
    to: hub.email,
    subject: `Material request forwarded — ${label ?? 'Material request'}`,
    html: genericAlertEmail(
      `Material request from Agricarbon`,
      `A material request has been forwarded to your hub for fulfillment.`,
      url,
      'Review and respond',
    ),
  })
}
