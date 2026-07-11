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

  // UR-030: always compute the link URL and return it so the admin can copy and
  // deliver it manually. Previously the URL was only built inside the
  // `if (hub.email)` branch and never returned — so when a hub had no email on
  // file (the common case), the link was created but undeliverable and
  // unobtainable. Mirrors POST /api/maintenance/[id]/send-to-shop, which already
  // returns `url`. (A copyable link in the admin Requests UI is the follow-up.)
  const url = statusLinkUrl(rawToken)
  let emailed = false
  if (hub.email) {
    await sendEmail({ kind: 'RESERVATION',
      to: hub.email,
      subject: `Reservation request (resent) — ${request.label ?? 'Rig reservation'}`,
      html: genericAlertEmail(
        `Rig reservation request from Agricarbon`,
        `A rig reservation request requires your confirmation. (This is a resent link; any previous link has been revoked.)`,
        url,
        'Review and respond',
      ),
    })
      .then(() => { emailed = true })
      .catch(() => {})
  }

  return NextResponse.json({ ok: true, emailed, url })
}
