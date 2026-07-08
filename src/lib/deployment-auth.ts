import { prisma } from '@/lib/prisma'
import { hasOpenAssignment } from '@/lib/deployment-assignments'

type Session = { userId: string; role: string }

/**
 * W0-10 PR-1: may this session act on this rig?
 *   admin  OR  an OPEN deployment_assignment (any role)  OR  — the legacy OR-fallback,
 *   deleted at PR-4 once the assignment table is the sole source of truth — the rig's
 *   legacy Rig.operatorId (primary) / rig_operators (secondary).
 * NON-REVOKING by construction: PR-1 only ADDS the assignment path; it can never remove
 * access that the legacy check granted. At PR-4 the two legacy clauses are removed and
 * `tsc` will flag `rig.operatorId` once the column is dropped — the compile-time backstop.
 */
export async function isAuthorizedForRig(rig: { id: string; operatorId: string }, session: Session): Promise<boolean> {
  if (session.role === 'ADMIN') return true
  if (await hasOpenAssignment(rig.id, session.userId)) return true
  // ── legacy OR-fallback (remove at W0-10 PR-4) ──────────────────────────────
  if (rig.operatorId === session.userId) return true
  const secondary = await prisma.rigOperator.findUnique({
    where: { rigId_operatorId: { rigId: rig.id, operatorId: session.userId } },
  })
  return !!secondary
  // ───────────────────────────────────────────────────────────────────────────
}

/** Fetch + authorize an ACTIVE rig (not ended); null if missing/ended/forbidden. */
export async function getAuthorizedActiveRig(id: string, session: Session) {
  const rig = await prisma.rig.findUnique({ where: { id } })
  if (!rig || rig.endedAt) return null
  return (await isAuthorizedForRig(rig, session)) ? rig : null
}

/** Fetch + authorize a rig regardless of ended state; null if missing/forbidden. */
export async function getAuthorizedRig(id: string, session: Session) {
  const rig = await prisma.rig.findUnique({ where: { id } })
  if (!rig) return null
  return (await isAuthorizedForRig(rig, session)) ? rig : null
}
