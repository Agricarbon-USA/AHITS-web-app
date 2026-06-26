import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { resolveStatusLink, markViewed, isLinkActionable, ALLOWED_ACTIONS } from '@/lib/status-links'
import { getRequest, getLineChecklist } from '@/lib/deployment-requests'

// Public, login-less context for a tokenized status link. Token-gated and
// rate-limited (the token IS the credential). Returns only the scoped fields
// the external party needs — never operator emails, costs, or unrelated data.
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
      photos: t.photos.map((p: { url: string }) => p.url),
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
          name: l.specificItemName ?? l.categoryName ?? l.itemType ?? l.vehicleType ?? l.description ?? 'Item',
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
    state: expired && link.state !== 'COMPLETED' ? 'EXPIRED' : link.state,
    actionable,
    allowedActions: actionable ? ALLOWED_ACTIONS[link.type] : [],
    recipientName: link.recipientName,
    subject,
  })
}
