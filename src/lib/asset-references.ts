import type { EquipmentStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { LIVE_KIT_ITEM, OPEN_TASK } from '@/lib/populations'

/**
 * PR-3b (RC-1 · S-7 · D-a · D-f): one "what still references this?" query behind
 * every retire / delete / deactivate. A record that something live still points at
 * cannot be retired, deleted or deactivated out from under it — the action is
 * refused with a 409 that names what is in the way and what to do about it.
 *
 *   openReferences(target)       → what references it, with names
 *   assertNoOpenReferences(...)  → throws ReferenceConflict (409 { error }) when any
 *                                  reference that blocks this kind of action exists
 *   referenceConflictBody(e)     → the route's catch: the 409 body, or null to rethrow
 *
 * Which references block is decided per kind in `assertNoOpenReferences` — e.g.
 * consumable stock does not block retiring an item (the counts are history) but a
 * unit out on a deployment does.
 */

type Db = Prisma.TransactionClient

export type ReferenceTarget =
  | { vehicleId: string }
  | { unitId: string }
  | { itemId: string }
  | { hubId: string }
  | { userId: string }

export interface OpenReferences {
  /** Live rig_vehicles rows: the vehicle is on a deployment that has not ended. */
  rigVehicles: { rigId: string; operatorName: string | null }[]
  /** Live kit lines: the unit / item is in a kit on an active deployment. */
  kitItems: { kitItemId: string; rigId: string; operatorName: string | null; quantity: number }[]
  /** Pending transfers that carry it. */
  pendingTransfers: { transferId: string; toOperatorName: string | null }[]
  /** Open damage reports on it. */
  openTasks: { id: string; taskName: string }[]
  /** Active HUB_RETURN links (a Returning unit not yet received). */
  activeLinks: { id: string; inventoryUnitId: string | null }[]
  /** Reservation holds not yet claimed or released. */
  heldLines: { id: string; held: number }[]
  /** Stock rows that hold something (quantity > 0, or for a hub, reservedQty > 0). */
  stock: { itemName: string; hubName: string; quantity: number }[]
  /** Active deployments on which the user is the PRIMARY operator (D-f). */
  primaryRigs: { rigId: string; label: string | null }[]
  /** Item only: units that are out, Returning or in repair (D-a). */
  unitsOut: { id: string; status: EquipmentStatus }[]
  /** Item only: open requests (draft / requested / staged / forwarded) that name it (PR-3c, D-t). */
  openRequestLines: { requestId: string; label: string | null }[]
  /** Item, delete scope only: units reserved on its stock rows (Σ reservedQty). */
  reserved: number
}

const ACTIVE_LINK_STATES = ['ISSUED', 'VIEWED', 'ACTED'] as const

const empty = (): OpenReferences => ({
  rigVehicles: [], kitItems: [], pendingTransfers: [], openTasks: [], activeLinks: [],
  heldLines: [], stock: [], primaryRigs: [], unitsOut: [], openRequestLines: [], reserved: 0,
})

/** Request statuses that are still open — a line on one of these names gear someone expects. */
const OPEN_REQUEST_STATUSES = ['DRAFT', 'REQUESTED', 'STAGED', 'FORWARDED'] as const

/**
 * PR-3c (D-t): open requests whose lines name the item — as the specific item asked
 * for, as a substitute, or through a staged unit. Request lines carry no Prisma
 * relation to their request, so it is two reads.
 */
async function openRequestLinesFor(db: Db, itemId: string): Promise<OpenReferences['openRequestLines']> {
  const unitIds = (await db.inventoryUnit.findMany({ where: { inventoryItemId: itemId }, select: { id: true } })).map((u) => u.id)
  const lines = await db.deploymentRequestLine.findMany({
    where: {
      OR: [
        { specificInventoryItemId: itemId },
        { substitutedItemId: itemId },
        ...(unitIds.length > 0 ? [{ resolvedUnitId: { in: unitIds } }] : []),
      ],
    },
    select: { requestId: true },
  })
  const requestIds = [...new Set(lines.map((l) => l.requestId))]
  if (requestIds.length === 0) return []
  const requests = await db.deploymentRequest.findMany({
    where: { id: { in: requestIds }, status: { in: [...OPEN_REQUEST_STATUSES] } },
    select: { id: true, label: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  return requests.map((r) => ({ requestId: r.id, label: r.label }))
}

/** The PRIMARY operator's name for each rig (the assignment roster is the source). */
async function primaryNames(db: Db, rigIds: string[]): Promise<Map<string, string | null>> {
  if (rigIds.length === 0) return new Map()
  const rows = await db.deploymentAssignment.findMany({
    where: { rigId: { in: rigIds }, role: 'PRIMARY', endedAt: null },
    select: { rigId: true, operatorId: true },
  })
  const users = await db.user.findMany({ where: { id: { in: rows.map((r) => r.operatorId) } }, select: { id: true, name: true } })
  const byId = new Map(users.map((u) => [u.id, u.name]))
  return new Map(rows.map((r) => [r.rigId, byId.get(r.operatorId) ?? null]))
}

/**
 * `scope: 'delete'` (PR-3c, item only) widens three reads for Delete, which must
 * leave nothing behind that still points at the item: kit lines open on ANY rig,
 * ended or not (a TRANSFER disposition leaves a consumable line open on an ended
 * rig); damage tasks on the item OR on any of its units; and Σ reservedQty across
 * its stock rows. Retire keeps the narrower reads it has always had.
 */
export async function openReferences(
  target: ReferenceTarget,
  db: Db = prisma,
  opts: { scope?: 'delete' } = {},
): Promise<OpenReferences> {
  const forDelete = opts.scope === 'delete' && 'itemId' in target
  const refs = empty()

  if ('vehicleId' in target) {
    const id = target.vehicleId
    const rvs = await db.rigVehicle.findMany({ where: { vehicleId: id, removedAt: null, rig: { endedAt: null } }, select: { rigId: true } })
    const names = await primaryNames(db, rvs.map((r) => r.rigId))
    refs.rigVehicles = rvs.map((r) => ({ rigId: r.rigId, operatorName: names.get(r.rigId) ?? null }))
    const xfers = await db.transferRequest.findMany({
      where: { status: 'PENDING', vehicles: { some: { vehicleId: id } } },
      select: { id: true, toOperator: { select: { name: true } } },
    })
    refs.pendingTransfers = xfers.map((t) => ({ transferId: t.id, toOperatorName: t.toOperator?.name ?? null }))
    refs.openTasks = await db.maintenanceTask.findMany({
      where: { ...OPEN_TASK, isDamageReport: true, vehicleId: id, inventoryUnitId: null },
      select: { id: true, taskName: true },
    })
    return refs
  }

  if ('unitId' in target || 'itemId' in target) {
    const unitWhere = 'unitId' in target ? { inventoryUnitId: target.unitId } : { inventoryItemId: target.itemId }
    const kis = await db.kitItem.findMany({
      where: forDelete ? { removedAt: null, ...unitWhere } : { ...LIVE_KIT_ITEM, ...unitWhere },
      select: { id: true, quantity: true, kit: { select: { rigId: true } } },
    })
    const names = await primaryNames(db, kis.map((k) => k.kit.rigId))
    refs.kitItems = kis.map((k) => ({ kitItemId: k.id, rigId: k.kit.rigId, operatorName: names.get(k.kit.rigId) ?? null, quantity: k.quantity }))

    const xfers = await db.transferRequest.findMany({
      where: {
        status: 'PENDING',
        items: { some: { kitItem: forDelete ? { id: { in: kis.map((k) => k.id) } } : unitWhere } },
      },
      select: { id: true, toOperator: { select: { name: true } } },
    })
    refs.pendingTransfers = xfers.map((t) => ({ transferId: t.id, toOperatorName: t.toOperator?.name ?? null }))

    const taskWhere = 'unitId' in target
      ? { inventoryUnitId: target.unitId }
      : forDelete
        ? { OR: [{ itemId: target.itemId }, { unit: { inventoryItemId: target.itemId } }] }
        : { itemId: target.itemId }
    refs.openTasks = await db.maintenanceTask.findMany({
      where: { ...OPEN_TASK, isDamageReport: true, ...taskWhere },
      select: { id: true, taskName: true },
    })

    const linkWhere = 'unitId' in target
      ? { inventoryUnitId: target.unitId }
      : { inventoryUnit: { inventoryItemId: target.itemId } }
    refs.activeLinks = await db.statusLink.findMany({
      where: { type: 'HUB_RETURN', state: { in: [...ACTIVE_LINK_STATES] }, ...linkWhere },
      select: { id: true, inventoryUnitId: true },
    })

    if ('itemId' in target) {
      const id = target.itemId
      refs.unitsOut = await db.inventoryUnit.findMany({
        where: { inventoryItemId: id, deletedAt: null, status: { in: ['CHECKED_OUT', 'IN_TRANSIT', 'IN_MAINTENANCE'] } },
        select: { id: true, status: true },
      })
      const held = await db.deploymentRequestLine.findMany({
        where: { heldItemId: id, releasedAt: null },
        select: { id: true, heldQty: true, claimedQty: true },
      })
      refs.heldLines = held.filter((l) => l.heldQty > l.claimedQty).map((l) => ({ id: l.id, held: l.heldQty - l.claimedQty }))
      const stock = await db.inventoryStock.findMany({
        where: { itemId: id, quantity: { gt: 0 } },
        select: { quantity: true, hub: { select: { name: true } }, item: { select: { name: true } } },
      })
      refs.stock = stock.map((s) => ({ itemName: s.item.name, hubName: s.hub.name, quantity: s.quantity }))
      refs.openRequestLines = await openRequestLinesFor(db, id)
      if (forDelete) {
        const sum = await db.inventoryStock.aggregate({ where: { itemId: id }, _sum: { reservedQty: true } })
        refs.reserved = sum._sum.reservedQty ?? 0
      }
    }
    return refs
  }

  if ('hubId' in target) {
    const id = target.hubId
    // A stock row only references the hub while it holds something: on-hand
    // quantity or a reservation. Empty rows (0 / 0) are history and don't block.
    // PR-3c: nor does a deleted item's stock — it is kept for Restore, seen nowhere.
    const stock = await db.inventoryStock.findMany({
      where: { hubId: id, item: { deletedAt: null }, OR: [{ quantity: { gt: 0 } }, { reservedQty: { gt: 0 } }] },
      select: { quantity: true, hub: { select: { name: true } }, item: { select: { name: true } } },
    })
    refs.stock = stock.map((s) => ({ itemName: s.item.name, hubName: s.hub.name, quantity: s.quantity }))
    refs.activeLinks = await db.statusLink.findMany({
      where: { type: 'HUB_RETURN', hubId: id, state: { in: [...ACTIVE_LINK_STATES] } },
      select: { id: true, inventoryUnitId: true },
    })
    const held = await db.deploymentRequestLine.findMany({
      where: { heldHubId: id, releasedAt: null },
      select: { id: true, heldQty: true, claimedQty: true },
    })
    refs.heldLines = held.filter((l) => l.heldQty > l.claimedQty).map((l) => ({ id: l.id, held: l.heldQty - l.claimedQty }))
    return refs
  }

  const id = target.userId
  const asPrimary = await db.deploymentAssignment.findMany({
    where: { operatorId: id, role: 'PRIMARY', endedAt: null },
    select: { rigId: true },
  })
  const rigs = await db.rig.findMany({
    where: { id: { in: asPrimary.map((a) => a.rigId) }, endedAt: null },
    select: { id: true, label: true },
  })
  refs.primaryRigs = rigs.map((r) => ({ rigId: r.id, label: r.label }))
  return refs
}

/** A refused retire / delete / deactivate: carries the 409 message. */
export class ReferenceConflict extends Error {
  readonly status = 409
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const deploymentOf = (operatorName: string | null) => (operatorName ? `${operatorName}'s deployment` : 'an active deployment')

export type ReferenceKind = 'vehicle' | 'unit' | 'item' | 'item-delete' | 'hub' | 'user'

const namedOnRequests = (lines: OpenReferences['openRequestLines']) =>
  lines.length === 1 && lines[0].label
    ? `Named on the open request "${lines[0].label}" — edit or cancel it first.`
    : `Named on ${plural(lines.length, 'open request', 'open requests')} — edit or cancel ${lines.length === 1 ? 'it' : 'them'} first.`

/**
 * Refuse when anything that blocks this kind of action still references the record.
 * `name` is the record's display name, used in the message. The first blocking
 * reference found is named — fix it and the next one (if any) is reported.
 *
 *   vehicle — on a live deployment, or in a pending transfer
 *   unit    — in a live kit, in a pending transfer, or Returning (active hub link)
 *   item    — any unit out / Returning / in repair (D-a); consumable stock on a
 *             deployment; unclaimed reservation holds; an open request naming it
 *             (PR-3c, D-t). Stock on the shelf does NOT block — the counts stay as history.
 *   item-delete — (refs from `openReferences(…, { scope: 'delete' })`) everything
 *             `item` refuses, plus open damage repairs on it or its units, kit lines
 *             left open on ended rigs, and units reserved on its stock rows (PR-3c).
 *   hub     — stock on hand, Returning units on their way to it, reservation holds
 *   user    — PRIMARY on an active deployment (D-f)
 */
export function assertNoOpenReferences(kind: ReferenceKind, name: string, refs: OpenReferences): void {
  const refuse = (msg: string): never => { throw new ReferenceConflict(msg) }

  if (kind === 'vehicle') {
    if (refs.rigVehicles.length > 0) refuse(`${name} is on ${deploymentOf(refs.rigVehicles[0].operatorName)} — end or transfer it first.`)
    if (refs.pendingTransfers.length > 0) refuse(`${name} is in a pending transfer${refs.pendingTransfers[0].toOperatorName ? ` to ${refs.pendingTransfers[0].toOperatorName}` : ''} — accept, decline or cancel it first.`)
    return
  }
  if (kind === 'unit') {
    if (refs.kitItems.length > 0) refuse(`${name} is on ${deploymentOf(refs.kitItems[0].operatorName)} — get it back first.`)
    if (refs.pendingTransfers.length > 0) refuse(`${name} is in a pending transfer — accept, decline or cancel it first.`)
    if (refs.activeLinks.length > 0) refuse(`${name} is Returning to a hub — mark it received first.`)
    return
  }
  if (kind === 'item') {
    if (refs.unitsOut.length > 0) {
      refuse(`${plural(refs.unitsOut.length, 'unit is', 'units are')} still out or in repair — get them back first.`)
    }
    const onRigs = refs.kitItems.reduce((n, k) => n + k.quantity, 0)
    if (onRigs > 0) refuse(`${onRigs} of ${name} ${onRigs === 1 ? 'is' : 'are'} still on deployments — get them back first.`)
    if (refs.pendingTransfers.length > 0) refuse(`${name} is in a pending transfer — accept, decline or cancel it first.`)
    const held = refs.heldLines.reduce((n, l) => n + l.held, 0)
    if (held > 0) refuse(`${held} of ${name} ${held === 1 ? 'is' : 'are'} held for a reservation — release or fulfil it first.`)
    if (refs.openRequestLines.length > 0) refuse(namedOnRequests(refs.openRequestLines))
    return
  }
  if (kind === 'item-delete') {
    if (refs.unitsOut.length > 0) {
      refuse(`${plural(refs.unitsOut.length, 'unit is', 'units are')} still out or in repair — get them back first.`)
    }
    if (refs.openTasks.length > 0) refuse(`${plural(refs.openTasks.length, 'open repair', 'open repairs')} — close ${refs.openTasks.length === 1 ? 'it' : 'them'} first.`)
    const onRigs = refs.kitItems.reduce((n, k) => n + k.quantity, 0)
    if (onRigs > 0) refuse(`${onRigs} of ${name} ${onRigs === 1 ? 'is' : 'are'} still on deployments — get them back first.`)
    if (refs.pendingTransfers.length > 0) refuse(`${name} is in a pending transfer — accept, decline or cancel it first.`)
    const held = refs.heldLines.reduce((n, l) => n + l.held, 0)
    if (held > 0) refuse(`${held} of ${name} ${held === 1 ? 'is' : 'are'} held for a reservation — release or fulfil it first.`)
    if (refs.reserved > 0) refuse(`${refs.reserved} reserved on open requests — release the holds first.`)
    if (refs.openRequestLines.length > 0) refuse(namedOnRequests(refs.openRequestLines))
    return
  }
  if (kind === 'hub') {
    if (refs.stock.length > 0) {
      const total = refs.stock.reduce((n, s) => n + s.quantity, 0)
      refuse(`${name} still holds stock (${plural(total, 'unit', 'units')} across ${plural(refs.stock.length, 'item', 'items')}) — move it first.`)
    }
    if (refs.activeLinks.length > 0) refuse(`${plural(refs.activeLinks.length, 'unit is', 'units are')} on the way back to ${name} — mark them received first.`)
    const held = refs.heldLines.reduce((n, l) => n + l.held, 0)
    if (held > 0) refuse(`${name} has ${held} held for reservations — release or fulfil them first.`)
    return
  }
  if (refs.primaryRigs.length > 0) {
    const label = refs.primaryRigs[0].label
    refuse(label
      ? `${name} is the operator on "${label}" — end or transfer it first.`
      : `${name} is the operator on an active deployment — end or transfer it first.`)
  }
}

/** In a route's catch: the 409 for a refused action, or null (rethrow anything else). */
export function referenceConflictBody(err: unknown): { error: string } | null {
  return err instanceof ReferenceConflict ? { error: err.message } : null
}
