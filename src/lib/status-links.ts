import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import type { Prisma, StatusLink, StatusLinkType } from '@prisma/client'

/**
 * Wave F — tokenized status links (the outbound-delivery primitive).
 *
 * A StatusLink is a capability URL: a long, unguessable token that grants ONE
 * external party (a maintenance shop, a hub, later an invoice processor) scoped,
 * time-bounded, login-less access to one record plus a fixed set of allowed
 * transitions that write back into AHITS. The raw token is emailed; only its
 * sha256 hash is stored (same secret-handling posture as invite tokens, but
 * hashed-at-rest — the stronger pattern).
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

/** 256-bit CSPRNG, URL-safe. The raw token is the credential — never stored. */
export function generateStatusToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export function statusLinkUrl(rawToken: string): string {
  return `${APP_URL}/s/${rawToken}`
}

const DEFAULT_EXPIRY_DAYS: Record<StatusLinkType, number> = {
  WORK_ORDER: 30,
  HUB_RETURN: 14,
  INVOICE: 30,
}

/** Allowed transition actions per link type (least-privilege whitelist). */
export const ALLOWED_ACTIONS: Record<StatusLinkType, string[]> = {
  WORK_ORDER: ['RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED'],
  HUB_RETURN: ['RECEIVED', 'DISCREPANCY'],
  INVOICE: ['RECEIVED', 'PAID'],
}

export interface IssueOptions {
  type: StatusLinkType
  createdById: string
  maintenanceTaskId?: string
  inventoryUnitId?: string
  hubId?: string
  recipientEmail?: string
  recipientName?: string
  expiresInDays?: number
}

export async function issueStatusLink(
  opts: IssueOptions,
): Promise<{ statusLink: StatusLink; rawToken: string; url: string }> {
  const rawToken = generateStatusToken()
  const tokenHash = hashToken(rawToken)
  const days = opts.expiresInDays ?? DEFAULT_EXPIRY_DAYS[opts.type]
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  const statusLink = await prisma.statusLink.create({
    data: {
      type: opts.type,
      tokenHash,
      expiresAt,
      maintenanceTaskId: opts.maintenanceTaskId ?? null,
      inventoryUnitId: opts.inventoryUnitId ?? null,
      hubId: opts.hubId ?? null,
      recipientEmail: opts.recipientEmail ?? null,
      recipientName: opts.recipientName ?? null,
      createdById: opts.createdById,
    },
  })
  return { statusLink, rawToken, url: statusLinkUrl(rawToken) }
}

/**
 * Wave F-R soft-gate: for each "Return to Hub" disposition of a SERIALIZED unit,
 * issue a HUB_RETURN status link so the hub can confirm receipt. Best-effort and
 * non-blocking — the unit stays AVAILABLE (re-deployable); this only records a
 * pending receipt. Shared by every return path that carries a hub target
 * (end-of-deployment and bulk item returns) so coverage is consistent.
 */
export async function issueHubReturnLinks(
  createdById: string,
  hubDispositions: { kitItemId: string; hubId: string }[],
): Promise<void> {
  if (hubDispositions.length === 0) return
  const hubByKitItem = new Map(hubDispositions.map((d) => [d.kitItemId, d.hubId]))
  const serialized = await prisma.kitItem.findMany({
    where: { id: { in: hubDispositions.map((d) => d.kitItemId) }, inventoryUnitId: { not: null } },
    select: { id: true, inventoryUnitId: true },
  })
  for (const ki of serialized) {
    if (!ki.inventoryUnitId) continue
    await issueStatusLink({
      type: 'HUB_RETURN',
      createdById,
      inventoryUnitId: ki.inventoryUnitId,
      hubId: hubByKitItem.get(ki.id),
    })
  }
}

const RESOLVE_INCLUDE = {
  maintenanceTask: {
    include: {
      vehicle: { select: { name: true, type: true } },
      item: { select: { name: true } },
      unit: { select: { serialNumber: true } },
      repairHub: { select: { name: true, city: true, state: true } },
      photos: { select: { url: true } },
    },
  },
  inventoryUnit: { include: { inventoryItem: { select: { name: true } } } },
  hub: { select: { name: true, city: true, state: true } },
} satisfies Prisma.StatusLinkInclude

export type ResolvedStatusLink = Prisma.StatusLinkGetPayload<{ include: typeof RESOLVE_INCLUDE }>

/** Look up a link by its raw token (hashing first). Returns null if unknown. */
export async function resolveStatusLink(rawToken: string): Promise<ResolvedStatusLink | null> {
  const tokenHash = hashToken(rawToken)
  return prisma.statusLink.findUnique({ where: { tokenHash }, include: RESOLVE_INCLUDE })
}

/** Terminal/blocked states a recipient can no longer act on. */
export function isLinkActionable(link: { state: string; expiresAt: Date }): boolean {
  if (link.state === 'REVOKED' || link.state === 'COMPLETED' || link.state === 'EXPIRED') return false
  if (link.expiresAt.getTime() < Date.now()) return false
  return true
}

/** Mark a link VIEWED the first time the recipient opens it (best-effort). */
export async function markViewed(link: StatusLink): Promise<void> {
  if (link.state !== 'ISSUED') return
  await prisma.$transaction(async (tx) => {
    const claim = await tx.statusLink.updateMany({
      where: { id: link.id, state: 'ISSUED' },
      data: { state: 'VIEWED', viewedAt: new Date() },
    })
    if (claim.count === 0) return
    await tx.statusLinkEvent.create({
      data: { statusLinkId: link.id, action: 'VIEWED', actorLabel: link.recipientName ?? 'recipient' },
    })
  })
}

async function notifyAdmins(
  tx: Prisma.TransactionClient,
  n: { type: string; title: string; body: string; link: string | null },
): Promise<void> {
  const admins = await tx.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } })
  if (admins.length === 0) return
  await tx.notification.createMany({
    data: admins.map((a) => ({ userId: a.id, type: n.type, title: n.title, body: n.body, link: n.link })),
  })
}

export interface TransitionInput {
  action: string
  actorLabel: string
  note?: string
}

export type TransitionResult =
  | { ok: true; state: string }
  | { ok: false; status: number; error: string }

/**
 * Apply a recipient-initiated transition. Validates the action against the
 * link type, performs the type-specific back-write into AHITS, records a
 * StatusLinkEvent, advances the link state, and notifies admins — all atomic.
 * Deliberately conservative: shop "COMPLETED" does NOT auto-finalize the
 * maintenance task (recurrence/cost/return-to-service stay a human admin step
 * via the existing complete endpoint); it only flags the task for finalization.
 */
export async function applyTransition(link: ResolvedStatusLink, input: TransitionInput): Promise<TransitionResult> {
  if (!isLinkActionable(link)) {
    return { ok: false, status: 409, error: 'This link is no longer active.' }
  }
  const action = input.action.toUpperCase()
  if (!ALLOWED_ACTIONS[link.type].includes(action)) {
    return { ok: false, status: 400, error: 'Action not permitted for this link.' }
  }
  const actorLabel = input.actorLabel.trim().slice(0, 120) || 'recipient'
  const note = input.note?.trim().slice(0, 2000) || null
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    // Record the event first (always).
    await tx.statusLinkEvent.create({
      data: { statusLinkId: link.id, action, note, actorLabel },
    })

    if (link.type === 'WORK_ORDER' && link.maintenanceTaskId) {
      const taskName = link.maintenanceTask?.taskName ?? 'a repair'
      const adminLink = '/admin/maintenance'
      if (action === 'RECEIVED' || action === 'IN_PROGRESS') {
        await tx.maintenanceTask.updateMany({
          where: { id: link.maintenanceTaskId, status: { in: ['UPCOMING', 'DUE_SOON', 'OVERDUE'] } },
          data: { status: 'IN_PROGRESS' },
        })
        await tx.statusLink.update({ where: { id: link.id }, data: { state: 'ACTED', actedAt: now } })
        await notifyAdmins(tx, {
          type: 'REPAIR_NEEDED',
          title: `Shop update — ${taskName}`,
          body: `${actorLabel} marked the work order ${action === 'RECEIVED' ? 'received' : 'in progress'}.`,
          link: adminLink,
        })
      } else if (action === 'INVOICED') {
        await tx.maintenanceTask.update({
          where: { id: link.maintenanceTaskId },
          data: note ? { invoiceNumber: note } : {},
        })
        await tx.statusLink.update({ where: { id: link.id }, data: { state: 'ACTED', actedAt: now } })
        await notifyAdmins(tx, {
          type: 'REPAIR_NEEDED',
          title: `Shop invoiced — ${taskName}`,
          body: `${actorLabel} submitted an invoice${note ? ` (#${note})` : ''}.`,
          link: adminLink,
        })
      } else if (action === 'COMPLETED') {
        await tx.statusLink.update({ where: { id: link.id }, data: { state: 'COMPLETED', completedAt: now, actedAt: now } })
        await notifyAdmins(tx, {
          type: 'REPAIR_NEEDED',
          title: `Repair completed — finalize ${taskName}`,
          body: `${actorLabel} marked the repair complete. Review and finalize in Maintenance to return the unit to service.`,
          link: adminLink,
        })
      }
    } else if (link.type === 'HUB_RETURN' && link.inventoryUnitId) {
      const itemName = link.inventoryUnit?.inventoryItem?.name ?? 'an item'
      const adminLink = '/admin/inventory'
      if (action === 'RECEIVED') {
        // Confirm receipt: flip the in-transit unit back to AVAILABLE.
        await tx.inventoryUnit.updateMany({
          where: { id: link.inventoryUnitId, status: 'IN_TRANSIT' },
          data: { status: 'AVAILABLE' },
        })
        await tx.statusLink.update({ where: { id: link.id }, data: { state: 'COMPLETED', completedAt: now, actedAt: now } })
        await notifyAdmins(tx, {
          type: 'DAMAGE_REPORTED',
          title: `Hub confirmed receipt — ${itemName}`,
          body: `${actorLabel} confirmed receipt of ${itemName} at the hub.`,
          link: adminLink,
        })
      } else if (action === 'DISCREPANCY') {
        // Leave the unit IN_TRANSIT for admin review; raise an admin notification.
        await tx.statusLink.update({ where: { id: link.id }, data: { state: 'ACTED', actedAt: now } })
        await notifyAdmins(tx, {
          type: 'DAMAGE_REPORTED',
          title: `Hub reported a discrepancy — ${itemName}`,
          body: `${actorLabel} reported a problem receiving ${itemName}${note ? `: ${note}` : ''}.`,
          link: adminLink,
        })
      }
    }
  })

  const final = await prisma.statusLink.findUnique({ where: { id: link.id }, select: { state: true } })
  return { ok: true, state: final?.state ?? 'ACTED' }
}
