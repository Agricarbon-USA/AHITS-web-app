// ─────────────────────────────────────────────────────────────────────────
// Damage / maintenance reporting (DAT-5)
//
// Single path for "this unit is damaged", used by every return/disposition flow
// so the outcome is identical no matter which button the operator pressed:
//   • the unit is flipped to IN_MAINTENANCE (fixable) or INOPERABLE (write-off),
//   • a MaintenanceTask is created and LINKED to the unit (so completing the
//     repair can return that exact unit to AVAILABLE — see maintenance PATCH),
//   • one DAMAGE_REPORTED alert is raised for the admin.
//
// Before this, the quick per-item "Needs maintenance" return flipped the unit
// but created no task and no alert, so routine damage notified no one.
// ─────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client'
import { createAlert } from '@/lib/alerts'

/** Where the unit physically goes for repair, derived from the chosen RepairType. */
export function resolutionPathFromRepairType(
  rt?: string | null,
): 'IN_FIELD' | 'HUB' | 'SHOP' | null {
  switch (rt) {
    case 'IN_FIELD':
      return 'IN_FIELD'
    case 'SHIP_TO_HUB':
      return 'HUB'
    case 'AT_SHOP':
    case 'SHIP_FOR_REPAIR':
      return 'SHOP'
    default:
      return null
  }
}

export interface DamageReportInput {
  inventoryItemId: string
  /** The specific unit being reported, when known. */
  inventoryUnitId?: string | null
  itemName: string
  operatorId: string
  /** true → repairable (IN_MAINTENANCE + task); false → write-off (INOPERABLE). */
  canBeFixed: boolean
  repairType?: string | null
  locationNote?: string | null
  shopName?: string | null
  shopAddress?: string | null
  dateDelivered?: Date | null
  purchaseOrder?: string | null
  invoiceNumber?: string | null
  repairHubId?: string | null
  inoperableNotes?: string | null
  photoUrls?: string[]
}

/**
 * Flip the unit, create the linked MaintenanceTask (when fixable), and raise a
 * single DAMAGE_REPORTED alert. Call inside the same `$transaction` as the
 * kit-item removal. `createAlert` uses the global client by design (so the alert
 * survives even if the tx rolls back), matching the prior call sites.
 */
export async function createDamageReport(
  tx: Prisma.TransactionClient,
  input: DamageReportInput,
  now: Date,
): Promise<void> {
  const { inventoryItemId, inventoryUnitId, itemName, operatorId, canBeFixed } = input

  if (inventoryUnitId) {
    await tx.inventoryUnit.update({
      where: { id: inventoryUnitId },
      data: {
        status: canBeFixed ? 'IN_MAINTENANCE' : 'INOPERABLE',
        inoperableNotes: input.inoperableNotes ?? null,
        inoperableReportedAt: now,
        inoperableReportedById: operatorId,
      },
    })
  }

  if (canBeFixed) {
    const task = await tx.maintenanceTask.create({
      data: {
        itemId: inventoryItemId,
        inventoryUnitId: inventoryUnitId ?? null,
        taskName: `Damage repair: ${itemName}`,
        isDamageReport: true,
        status: 'IN_PROGRESS',
        repairType: (input.repairType ?? null) as never,
        resolutionPath: resolutionPathFromRepairType(input.repairType) as never,
        locationNote: input.locationNote ?? input.shopName ?? null,
        shopName: input.shopName ?? null,
        shopAddress: input.shopAddress ?? null,
        dateDelivered: input.dateDelivered ?? null,
        purchaseOrder: input.purchaseOrder ?? null,
        invoiceNumber: input.invoiceNumber ?? null,
        repairHubId: input.repairHubId ?? null,
      },
    })
    await createAlert('DAMAGE_REPORTED', 'maintenance_tasks', task.id, { itemName, operatorId })
    if (input.photoUrls?.length) {
      await tx.photo.createMany({
        data: input.photoUrls.map((url) => ({
          url,
          context: 'DAMAGE' as const,
          inventoryItemId,
          maintenanceId: task.id,
          uploadedById: operatorId,
        })),
      })
    }
  } else {
    // Write-off: no repair task, but still alert the admin that a unit is gone.
    await createAlert('DAMAGE_REPORTED', 'inventory_units', inventoryUnitId ?? inventoryItemId, {
      itemName,
      operatorId,
      writeOff: true,
    })
    if (input.photoUrls?.length) {
      await tx.photo.createMany({
        data: input.photoUrls.map((url) => ({
          url,
          context: 'DAMAGE' as const,
          inventoryItemId,
          uploadedById: operatorId,
        })),
      })
    }
  }
}
