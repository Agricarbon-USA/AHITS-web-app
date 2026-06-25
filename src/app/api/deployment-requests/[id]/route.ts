import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/session'
import { getRequest, applyRequestTransition, type RequestAction } from '@/lib/deployment-requests'
import { createAlert } from '@/lib/alerts'
import { issueStatusLink, statusLinkUrl } from '@/lib/status-links'
import { sendEmail } from '@/lib/email/resend'
import { genericAlertEmail } from '@/lib/email/templates'
import { prisma } from '@/lib/prisma'

const ADMIN_ONLY_ACTIONS = ['confirm', 'prepare', 'decline', 'fulfill', 'forward', 'complete'] as const

const patchSchema = z.object({
  action: z.enum(['submit', 'cancel', 'confirm', 'prepare', 'decline', 'fulfill', 'forward', 'complete']),
  decisionNote: z.string().trim().max(2000).optional().nullable(),
  fulfillerHubId: z.string().optional().nullable(),
  fulfillerOperatorId: z.string().optional().nullable(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const result = await getRequest(id)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Operators may only read their own requests.
  if (session.role !== 'ADMIN' && result.requestedById !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

  // Operators without admin role may only act on their own requests.
  if (!isAdminOnly && session.role !== 'ADMIN' && result.requestedById !== session.userId) {
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
    const msg = action === 'submit' ? 'Only a draft can be submitted.' : 'Transition not allowed in the current state.'
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  // Post-transition side effects (best-effort, non-blocking).
  if (action === 'submit' && result.request.requestType === 'MATERIAL') {
    await createAlert('MATERIAL_REQUEST', 'deployment_requests', id, {
      name: result.request.label ?? 'Material request',
    }).catch(() => {})
  } else if (action === 'forward') {
    if (extra.fulfillerHubId) {
      await issueForwardHubLink(id, extra.fulfillerHubId, session.userId, result.request.label).catch(() => {})
    } else if (extra.fulfillerOperatorId) {
      await prisma.notification.create({
        data: {
          userId: extra.fulfillerOperatorId,
          type: 'RESERVATION_UPDATE',
          title: 'Material request assigned to you',
          body: result.request.label ? `"${result.request.label}" has been forwarded to you.` : 'A material request has been forwarded to you.',
          link: '/operator/requests',
        },
      }).catch(() => {})
    }
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
  await sendEmail({
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
