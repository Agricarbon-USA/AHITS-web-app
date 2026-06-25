import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'
import { getRequest } from '@/lib/deployment-requests'
import { issueStatusLink, statusLinkUrl } from '@/lib/status-links'
import { sendEmail } from '@/lib/email/resend'
import { genericAlertEmail } from '@/lib/email/templates'
import { prisma } from '@/lib/prisma'

// Revoke any active hub links for this request and issue a fresh one.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Admin only.' }, { status: 403 })
  const { id } = await params

  const result = await getRequest(id)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { request } = result
  if (!request.fulfillerHubId) {
    return NextResponse.json({ error: 'No hub assigned to this request.' }, { status: 409 })
  }

  // Revoke existing active links for this request so only one link is live at a time.
  await prisma.statusLink.updateMany({
    where: {
      deploymentRequestId: id,
      type: 'RESERVATION',
      state: { in: ['ISSUED', 'VIEWED', 'ACTED'] },
    },
    data: { state: 'REVOKED' },
  })

  const hubs = await prisma.$queryRaw<{ name: string; email: string | null }[]>`
    SELECT "name", "email" FROM "hubs" WHERE "id" = ${request.fulfillerHubId}
  `
  const hub = hubs[0]
  if (!hub) return NextResponse.json({ error: 'Hub not found.' }, { status: 404 })

  const { rawToken } = await issueStatusLink({
    type: 'RESERVATION',
    deploymentRequestId: id,
    hubId: request.fulfillerHubId,
    createdById: session.userId,
    recipientEmail: hub.email ?? undefined,
    recipientName: hub.name,
  })

  if (hub.email) {
    const url = statusLinkUrl(rawToken)
    await sendEmail({
      to: hub.email,
      subject: `Reservation request (resent) — ${request.label ?? 'Rig reservation'}`,
      html: genericAlertEmail(
        `Rig reservation request from Agricarbon`,
        `A rig reservation request requires your confirmation. (This is a resent link; any previous link has been revoked.)`,
        url,
        'Review and respond',
      ),
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
