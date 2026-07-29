import { NextRequest, NextResponse } from 'next/server'
import type { StatusLinkType } from '@prisma/client'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { resolveStatusLink, markViewed, isLinkActionable, ALLOWED_ACTIONS } from '@/lib/status-links'
import { getRequest, getLineChecklist } from '@/lib/deployment-requests'
import { VEHICLE_TYPE_LABELS, type VehicleTypeValue } from '@/lib/vehicle-types'

// Human label per link type, shown on a dead-link page in place of any subject data.
const LINK_LABELS: Record<StatusLinkType, string> = {
  WORK_ORDER: 'Repair Work Order',
  HUB_RETURN: 'Hub Return',
  INVOICE: 'Invoice',
  RESERVATION: 'Rig Reservation Request',
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const ip = clientIp(_req)
  const rl = await rateLimit(`statuslink:${ip}`, 60, 5 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const link = await resolveStatusLink(token)
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // First open marks it viewed (best-effort, non-fatal).
  await markViewed(link).catch(() => {})

  const expired = link.expiresAt.getTime() < Date.now()
  const actionable = isLinkActionable(link)
  const state = expired && link.state !== 'COMPLETED' ? 'EXPIRED' : link.state

  // §3.4 read-after leak: a dead link (REVOKED / COMPLETED / clock-expired) must
  // NOT serve the subject payload — it would leak live hub inventory (availableUnits
  // / substitutableItems on a stale RESERVATION) or asset/problem/serial details on a
  // stale WORK_ORDER / HUB_RETURN. Return a minimal body and skip the getRequest /
  // getLineChecklist queries entirely — don't build-then-strip. The portal page falls
  // back to its own header copy (the LINK_LABELS string) when subject fields are absent.
  if (!actionable) {
    return NextResponse.json({
      type: link.type,
      state,
      actionable: false,
      allowedActions: [],
      label: LINK_LABELS[link.type],
      subject: {},
    })
  }

  // Build a scoped, least-privilege context payload per link type.
  let subject: Record<string, unknown> = {}
  if (link.type === 'WORK_ORDER' && link.maintenanceTask) {
    const t = link.maintenanceTask
    subject = {
      kind: 'work_order',
      taskName: t.taskName,
      asset: t.vehicle?.name ?? t.item?.name ?? 'Equipment',
      serialNumber: t.unit?.serialNumber ?? null,
      problem: t.notes ?? null,
      shipToHub: t.repairHub ? `${t.repairHub.name} — ${t.repairHub.city}, ${t.repairHub.state}` : null,
      // UR-005b: photos are NOT exposed on the login-less status page — they live
      // in a private bucket served only through the auth-gated proxy. Cost and
      // status are communicated in-app; external image sharing is deprioritized.
    }
  } else if (link.type === 'HUB_RETURN' && link.inventoryUnit) {
    subject = {
      kind: 'hub_return',
      asset: link.inventoryUnit.inventoryItem?.name ?? 'Equipment',
      hub: link.hub ? `${link.hub.name} — ${link.hub.city}, ${link.hub.state}` : null,
    }
  } else if (link.type === 'RESERVATION' && link.deploymentRequestId) {
    const result = await getRequest(link.deploymentRequestId)
    if (result) {
      const { request } = result
      const { lines, progress } = await getLineChecklist(
        link.deploymentRequestId,
        request.fulfillerHubId,
      )
      subject = {
        kind: 'reservation',
        label: request.label,
        neededBy: request.neededBy?.toISOString() ?? null,
        requester: request.requestedByName,
        project: request.projectName,
        progress,
        lines: lines.map((l) => ({
          id: l.id,
          name:
            l.specificItemName ??
            l.specificVehicleName ??
            l.categoryName ??
            (l.vehicleType ? (VEHICLE_TYPE_LABELS[l.vehicleType as VehicleTypeValue] ?? l.vehicleType) : null) ??
            l.itemType ??
            l.description ??
            'Item',
          requestedQty: l.requestedQty,
          kind: l.lineType,
          itemType: l.itemType,
          fulfillmentStatus: l.fulfillmentStatus,
          fulfilledQty: l.fulfilledQty,
          substitutedItemId: l.substitutedItemId,
          substitutedName: l.substitutedName,
          resolvedUnitId: l.resolvedUnitId,
          denyReason: l.denyReason,
          availableUnits: l.availableUnits,
          substitutableItems: l.substitutableItems,
        })),
      }
    }
  }

  return NextResponse.json({
    type: link.type,
    state,
    actionable,
    allowedActions: ALLOWED_ACTIONS[link.type],
    recipientName: link.recipientName,
    label: LINK_LABELS[link.type],
    subject,
  })
}
