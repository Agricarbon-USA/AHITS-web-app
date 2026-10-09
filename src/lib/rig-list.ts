import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getActiveRigForOperator, getDeploymentRostersForDisplay } from '@/lib/deployment-assignments'

// The rig shape every operator surface renders: GET /api/deployments (list) and
// GET /api/deployments/mine (PR-5, one rig) serialize through here, so the two can
// never drift. Moved verbatim from the deployments route.

// Trimmed include for GET list — operator/project/secondaryOperators sourced from roster helpers
export const RIG_LIST_INCLUDE = {
  vehicles: {
    where: { removedAt: null },
    include: { vehicle: { select: { id: true, name: true, type: true, status: true, isRental: true, rentalAgreementUrl: true } } },
  },
  kits: {
    include: {
      items: {
        where: { removedAt: null },
        include: {
          item: {
            select: {
              id: true,
              name: true,
              itemType: true,
              categoryRef: { select: { name: true } },
            },
          },
          inventoryUnit: {
            select: { id: true, qrCodeId: true, serialNumber: true, status: true },
          },
        },
      },
    },
  },
} as const

type ListRig = Prisma.RigGetPayload<{ include: typeof RIG_LIST_INCLUDE }>

export async function serializeRigsForList(rigs: ListRig[]) {
  // UR-032: display roster so ENDED deployments (active=false / history) keep
  // their operator attribution instead of serializing operator: null. Identical
  // to the open roster for active deployments.
  const rosters = await getDeploymentRostersForDisplay(rigs.map((r) => r.id))

  // W0-10 PR-4: the display roster is the sole source of operator attribution. It returns
  // the FINAL roster for ended deployments too (max_ended CTE), so historical attribution
  // still shows. A rig with no PRIMARY assignment (should be impossible under PR-2 index B +
  // the §6 Q1/Q2 drop gate) serializes operator:null rather than crashing.
  return rigs.map((r) => {
    const ro = rosters.get(r.id) ?? { operator: null, operatorId: null, secondaryOperators: [], projects: [] }
    const operator = ro.operator ? { id: ro.operator.id, name: ro.operator.name } : { id: 'unknown', name: 'Unknown operator' }
    return {
      ...r,
      operatorId: ro.operatorId ?? null,
      operator,
      project: ro.projects[0] ?? null,
      secondaryOperators: ro.secondaryOperators,
    }
  })
}

/** PR-5 (L-8/L-9): the caller's own active rig — PRIMARY first, then newest; any role,
 *  admins included (an admin covering a rig sees theirs, not everyone's newest). */
export async function getMyActiveRig(userId: string) {
  const rigId = await getActiveRigForOperator(userId, prisma, { includeSecondary: true })
  if (!rigId) return null
  const rig = await prisma.rig.findFirst({ where: { id: rigId, endedAt: null }, include: RIG_LIST_INCLUDE })
  if (!rig) return null
  const [out] = await serializeRigsForList([rig])
  return out
}
