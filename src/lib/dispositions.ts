import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { DeploymentEnded } from '@/lib/deployment-auth'
import { ReferenceConflict } from '@/lib/asset-references'

// P1-1a (D52): the rules every deployment write shares — who a transfer may go to
// (§0-b), what is waiting on a transfer (§0-s), and the line lock that orders returns.

const quoted = (name: string | null) => (name ? `"${name}"` : null)

/**
 * §0-b: "Transfer to a person" names a real, active person who isn't the deployment's
 * own operator. `lines` are the TRANSFER lines only. 409 for the two that depend on
 * changing state (deactivated, already the primary), so `withIdempotency` doesn't cache
 * them (it caches 2xx and 400).
 */
export async function transferRecipientProblem(
  lines: { toOperatorId?: string | null; name: string | null }[], // TRANSFER lines only
  primaryId: string | null,
): Promise<{ status: 400 | 409; error: string } | null> {
  if (lines.length === 0) return null
  if (!primaryId) return { status: 409, error: 'This deployment has already ended.' }

  const ids = [...new Set(lines.map((l) => l.toOperatorId).filter((x): x is string => !!x))]
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, isActive: true } })
    : []
  const byId = new Map(users.map((u) => [u.id, u]))

  for (const line of lines) {
    const item = quoted(line.name)
    if (!line.toOperatorId) {
      return { status: 400, error: item ? `Pick a person to transfer ${item} to.` : 'Pick a person to transfer to.' }
    }
    const user = byId.get(line.toOperatorId)
    if (!user) {
      return {
        status: 400,
        error: item ? `The person picked to receive ${item} wasn't found.` : "The person picked to receive this equipment wasn't found.",
      }
    }
    if (!user.isActive) {
      return { status: 409, error: `${user.name} is deactivated — reactivate them or choose someone else.` }
    }
    if (user.id === primaryId) {
      return {
        status: 409,
        error: item ? `${item} is already with ${user.name} — pick someone else.` : `This equipment is already with ${user.name} — pick someone else.`,
      }
    }
  }
  return null
}

/** §0-s: a write refused because the gear is waiting on a transfer. Always a 409. */
export class WaitingConflict extends Error {
  readonly status = 409
}

/** `"<item>" is waiting on transfer to <name>. Cancel that transfer first.` */
export const waitingMessage = (name: string, toName: string) =>
  `"${name}" is waiting on transfer to ${toName}. Cancel that transfer first.`

/** `Only <free> of "<item>" are free — <qty> are waiting on transfer to <name>.` */
export const partlyFreeMessage = (name: string, free: number, waiting: number, toName: string) =>
  `Only ${free} of "${name}" are free — ${waiting} are waiting on transfer to ${toName}.`

/**
 * §0-s: what of this deployment is waiting on a transfer — a TransferItem or
 * TransferVehicle of a PENDING TransferRequest from it. `qty: null` means the whole
 * line. A line in two waiting transfers (legacy, §6 A3) sums the quantities; null if
 * either is null.
 */
export async function waitingTransfersForRig(rigId: string, db: Prisma.TransactionClient = prisma): Promise<{
  items: Map<string, { qty: number | null; toName: string }> // kitItemId
  vehicles: Map<string, { toName: string }> // vehicleId
}> {
  const pending = await db.transferRequest.findMany({
    where: { fromRigId: rigId, status: 'PENDING' },
    select: {
      toOperator: { select: { name: true } },
      items: { select: { kitItemId: true, quantity: true } },
      vehicles: { select: { vehicleId: true } },
    },
  })
  const items = new Map<string, { qty: number | null; toName: string }>()
  const vehicles = new Map<string, { toName: string }>()
  for (const t of pending) {
    const toName = t.toOperator?.name ?? 'someone'
    for (const ti of t.items) {
      const prev = items.get(ti.kitItemId)
      if (!prev) {
        items.set(ti.kitItemId, { qty: ti.quantity ?? null, toName })
      } else {
        items.set(ti.kitItemId, {
          qty: prev.qty == null || ti.quantity == null ? null : prev.qty + ti.quantity,
          toName: prev.toName === toName ? toName : `${prev.toName}, ${toName}`,
        })
      }
    }
    for (const tv of t.vehicles) {
      if (!vehicles.has(tv.vehicleId)) vehicles.set(tv.vehicleId, { toName })
    }
  }
  return { items, vehicles }
}

/**
 * Lock this request's open kit lines (after the deployment claim). Returns the open rows.
 * `skipClosed` (bulk and single return): a line a racing return just closed is skipped,
 * as today (CR-17). Without it (the selected-equipment transfer), a missing line is a 409.
 */
export async function lockKitItems(
  tx: Prisma.TransactionClient,
  ids: string[],
  opts: { skipClosed: boolean },
): Promise<{ id: string; quantity: number }[]> {
  const list = [...new Set(ids)].sort()
  if (list.length === 0) return []
  const rows = await tx.$queryRaw<{ id: string; quantity: number }[]>`
    SELECT "id", "quantity" FROM "kit_items"
    WHERE "id" IN (${Prisma.join(list)}) AND "removedAt" IS NULL
    ORDER BY "id" FOR UPDATE`
  if (!opts.skipClosed && rows.length < list.length) {
    throw new ReferenceConflict("Some of this equipment isn't on this deployment any more. Refresh and try again.")
  }
  return rows
}

/**
 * The conflicts every deployment write maps first, in every catch: an ended deployment,
 * waiting gear, and a reference conflict — each a 409 with its own message.
 */
export function deploymentWriteConflict(err: unknown): { error: string } | null {
  if (err instanceof DeploymentEnded || err instanceof WaitingConflict || err instanceof ReferenceConflict) {
    return { error: err.message }
  }
  return null
}
