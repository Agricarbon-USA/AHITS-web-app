import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/session'
import { createRequest, listRequests, LINE_TYPES, VEHICLE_TYPES, REQUEST_TYPES } from '@/lib/deployment-requests'
import { createAlert } from '@/lib/alerts'
import { issueStatusLink, statusLinkUrl } from '@/lib/status-links'
import { sendEmail } from '@/lib/email/resend'
import { genericAlertEmail } from '@/lib/email/templates'
import { prisma } from '@/lib/prisma'
import { withIdempotency } from '@/lib/idempotency'

const lineSchema = z
  .object({
    lineType: z.enum(LINE_TYPES),
    categoryId: z.string().optional().nullable(),
    itemType: z.string().optional().nullable(),
    vehicleType: z.enum(VEHICLE_TYPES).optional().nullable(),
    requestedQty: z.number().int().min(1).max(999).default(1),
    specificInventoryItemId: z.string().optional().nullable(),
    specificVehicleId: z.string().optional().nullable(),
    specificInventoryUnitId: z.string().optional().nullable(),
    description: z.string().trim().max(500).optional().nullable(),
    reorderUrl: z.string().trim().max(1000).optional().nullable(),
    shipToHubId: z.string().optional().nullable(),
    shipToAddress: z.string().trim().max(500).optional().nullable(),
  })
  .refine(
    (l) => {
      if (l.lineType === 'VEHICLE') return !!l.vehicleType || !!l.specificVehicleId
      if (l.lineType === 'NEW_PURCHASE' || l.lineType === 'SHIPPING_LABEL') return !!l.description
      return !!l.categoryId || !!l.itemType || !!l.specificInventoryItemId
    },
    { message: 'Each line needs a category/item (kit), vehicle type/vehicle, or description (purchase/shipping).' },
  )

const bodySchema = z.object({
  requestType: z.enum(REQUEST_TYPES).default('RESERVATION'),
  label: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  neededBy: z.string().datetime().optional().nullable(),
  projectId: z.string().optional().nullable(),
  forOperatorId: z.string().optional().nullable(),
  fulfillerHubId: z.string().optional().nullable(),
  // CC-33 (E4): fulfillerOperatorId dropped — no client ever sent it (D21).
  status: z.enum(['DRAFT', 'REQUESTED']).default('REQUESTED'),
  lines: z.array(lineSchema).min(1, 'Add at least one requested item or vehicle'),
})

export async function GET() {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Admins see every request; operators see only their own.
  const scope = session.role === 'ADMIN' ? undefined : session.userId
  return NextResponse.json({ data: await listRequests(scope) })
}

export async function POST(req: NextRequest) {
  // FND-21: dedupe the create so an offline-queue replay or a double-tap can't
  // open two requests. No-ops when the client sends no Idempotency-Key.
  return withIdempotency(req, 'deployment-requests.POST', () => _POST(req))
}

async function _POST(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const d = parsed.data

  const id = await createRequest(
    {
      requestType: d.requestType,
      label: d.label ?? null,
      notes: d.notes ?? null,
      neededBy: d.neededBy ? new Date(d.neededBy) : null,
      projectId: d.projectId || null,
      forOperatorId: d.forOperatorId || null,
      fulfillerHubId: d.fulfillerHubId || null,
      fulfillerOperatorId: null, // CC-33 (E4): forward→operator removed (D21)
      status: d.status,
      lines: d.lines.map((l) => ({
        lineType: l.lineType,
        categoryId: l.categoryId ?? null,
        itemType: l.itemType ?? null,
        vehicleType: l.vehicleType ?? null,
        requestedQty: l.requestedQty,
        specificInventoryItemId: l.specificInventoryItemId ?? null,
        specificVehicleId: l.specificVehicleId ?? null,
        specificInventoryUnitId: l.specificInventoryUnitId ?? null,
        description: l.description ?? null,
        reorderUrl: l.reorderUrl ?? null,
        shipToHubId: l.shipToHubId ?? null,
        shipToAddress: l.shipToAddress ?? null,
      })),
    },
    session.userId,
  )

  // Side effects for direct-to-REQUESTED submissions (best-effort, non-blocking).
  if (d.status === 'REQUESTED') {
    if (d.requestType === 'MATERIAL') {
      await createAlert('MATERIAL_REQUEST', 'deployment_requests', id, {
        name: d.label ?? 'Material request',
      }).catch(() => {})
    } else if (d.requestType === 'RESERVATION' && d.fulfillerHubId) {
      await issueReservationLink(id, d.fulfillerHubId, session.userId, d.label).catch(() => {})
    }
  }

  return NextResponse.json({ id }, { status: 201 })
}

async function issueReservationLink(requestId: string, hubId: string, createdById: string, label: string | null | undefined): Promise<void> {
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
    subject: `Reservation request — ${label ?? 'Rig reservation'}`,
    html: genericAlertEmail(
      `Rig reservation request from Agricarbon`,
      `A rig reservation request has been submitted and requires your confirmation.`,
      url,
      'Review and respond',
    ),
  })
}
