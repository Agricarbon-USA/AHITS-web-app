import { Prisma } from '@prisma/client'
import { hasOpenAssignment } from '@/lib/deployment-assignments'
import { prisma } from '@/lib/prisma'

type Session = { userId: string; role: string }

/**
 * W0-10: may this session act on this rig?
 *   admin  OR  an OPEN deployment_assignment (any role).
 * The assignment table is the sole source of truth (legacy Rig.operatorId /
 * rig_operators were dropped in PR-4).
 */
export async function isAuthorizedForRig(rig: { id: string }, session: Session): Promise<boolean> {
  if (session.role === 'ADMIN') return true
  return hasOpenAssignment(rig.id, session.userId)
}

/** Fetch + authorize an ACTIVE rig (not ended); null if missing/ended/forbidden. */
export async function getAuthorizedActiveRig(id: string, session: Session) {
  const rig = await prisma.rig.findUnique({ where: { id } })
  if (!rig || rig.endedAt) return null
  return (await isAuthorizedForRig(rig, session)) ? rig : null
}

// CC-33 (A4): removed dead getAuthorizedRig (0 importers; getAuthorizedActiveRig is the live path).

// P1-1a (D52 · §0-j): the one lock rule. Every transaction that changes a deployment's
// contents, or answers a transfer from it, takes that deployment's `rigs` row FIRST —
// before any line, stock, transfer or handoff row — so races end in a named 409, never
// a 500 or a deadlock.
export class DeploymentEnded extends Error { constructor() { super('This deployment has already ended.') } }

/** Take a LIVE deployment for a write. First statement of the transaction. */
export async function claimActiveRig(tx: Prisma.TransactionClient, id: string, data: Prisma.RigUpdateManyMutationInput = { updatedAt: new Date() }) {
  const r = await tx.rig.updateMany({ where: { id, endedAt: null }, data })
  if (r.count === 0) throw new DeploymentEnded()
}

/** Lock deployments that may already have ended (transfer answers). Id order, so two never deadlock. */
export async function lockRigs(tx: Prisma.TransactionClient, ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))].sort()
  if (list.length) await tx.$queryRaw`SELECT 1 FROM "rigs" WHERE "id" IN (${Prisma.join(list)}) ORDER BY "id" FOR UPDATE`
}
