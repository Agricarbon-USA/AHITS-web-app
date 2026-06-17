import type { Prisma } from '@prisma/client'

export function returnConditionToLogCondition(
  rc: string | undefined,
): 'GOOD' | 'NEEDS_REPAIR' | 'MISSING_PARTS' | null {
  if (rc === 'IN_MAINTENANCE') return 'NEEDS_REPAIR'
  if (rc === 'INOPERABLE') return 'MISSING_PARTS'
  if (rc === 'GOOD') return 'GOOD'
  return null
}

/**
 * Returns the IDs of CHECKED_OUT inventory units for a given item
 * that are in kit items of OTHER active rigs (not this one).
 * Prevents accidentally returning units that belong to another operator's kit.
 */
export async function getUnitsInOtherRigs(
  tx: Prisma.TransactionClient,
  inventoryItemId: string,
  excludeRigId: string,
): Promise<string[]> {
  const otherKitItems = await tx.kitItem.findMany({
    where: {
      inventoryItemId,
      removedAt: null,
      inventoryUnitId: { not: null },
      kit: { rig: { endedAt: null, id: { not: excludeRigId } } },
    },
    select: { inventoryUnitId: true },
  })
  return otherKitItems.map((ki) => ki.inventoryUnitId!).filter(Boolean)
}
