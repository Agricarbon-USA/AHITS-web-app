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
