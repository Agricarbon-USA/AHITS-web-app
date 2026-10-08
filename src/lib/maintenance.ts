import dayjs from 'dayjs'
import type { Prisma, RepairMethod, RepairType, ReturnDestinationType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createAlert, resolveAlertsFor } from '@/lib/alerts'
import { OPEN_TASK } from '@/lib/populations'
import { pullForRepair, restoreIfClear, type AssetRef } from '@/lib/asset-status'

// ─────────────────────────────────────────────────────────────────────────
// Maintenance recurrence & mileage triggers (Wave G)
//
// Scheduled maintenance recurs IN PLACE on the same MaintenanceTask row: when
// completed, `lastCompleted` records the service and `nextDue` / `nextOdometer`
// roll forward by the interval. (Damage reports are one-off and terminate.)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Next due date for a time-based recurring task. MILEAGE / PER_DEPLOYMENT tasks
 * are not date-driven, so they return null (they roll forward on odometer or
 * deployment events instead).
 */
export function nextDueFromInterval(
  intervalType: string,
  intervalValue: number,
  from: Date,
): Date | null {
  if (intervalValue <= 0) return null
  if (intervalType === 'DAYS') return dayjs(from).add(intervalValue, 'day').toDate()
  if (intervalType === 'MONTHS') return dayjs(from).add(intervalValue, 'month').toDate()
  return null
}

// How many miles ahead of `nextOdometer` a mileage task flips to DUE_SOON.
export const DUE_SOON_MILES = 500

/**
 * Apply a daily-check odometer reading: record it on the vehicle and roll its
 * mileage-based maintenance tasks to DUE_SOON / OVERDUE (raising the usual
 * deduped alert), so mileage maintenance becomes proactive instead of relying
 * on someone remembering. Best-effort — never throws into the check submission.
 */
export async function applyOdometerReading(vehicleId: string, odometer: number): Promise<void> {
  try {
    // Only advance the recorded odometer (never roll it backwards on a typo).
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, deletedAt: null }, select: { odometer: true, name: true } })
    if (!vehicle) return
    if (vehicle.odometer == null || odometer > vehicle.odometer) {
      await prisma.vehicle.update({ where: { id: vehicleId }, data: { odometer } })
    }

    const tasks = await prisma.maintenanceTask.findMany({
      where: {
        vehicleId,
        deletedAt: null,
        intervalType: 'MILEAGE',
        isDamageReport: false,
        status: { in: ['UPCOMING', 'DUE_SOON'] },
        nextOdometer: { not: null },
      },
    })
    for (const t of tasks) {
      if (t.nextOdometer == null) continue
      if (odometer >= t.nextOdometer) {
        await prisma.maintenanceTask.update({ where: { id: t.id }, data: { status: 'OVERDUE' } })
        await createAlert('MAINTENANCE_OVERDUE', 'maintenance_tasks', t.id, {
          taskName: t.taskName,
          itemName: vehicle.name,
        })
      } else if (odometer >= t.nextOdometer - DUE_SOON_MILES && t.status === 'UPCOMING') {
        await prisma.maintenanceTask.update({ where: { id: t.id }, data: { status: 'DUE_SOON' } })
      }
    }
  } catch {
    /* trigger is advisory — a failure here must not fail the daily check */
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Damage tasks (PR-3a · RC-1)
//
// One open damage task per asset (S-5): a second report on an asset that already
// has an open one is appended to it, so closing "the repair" closes the repair —
// not one of two, with the asset restored early. Opening and closing go through
// here so the task, its alert and the asset's status move in one transaction.
// ─────────────────────────────────────────────────────────────────────────

type Tx = Prisma.TransactionClient

/**
 * What the damage task is about. A unit task carries its item; `item` is the
 * legacy item-only report (no unit could be resolved) — never reused, never pulls.
 */
export type DamageAsset = AssetRef & { itemId?: string } | { kind: 'item'; itemId: string }

/** Where the report came from. Admin triage (`DAILY_CHECK`, `ADMIN_REVIEW`) never rings the bell — the admin is already looking at it. */
export type DamageSource = 'REPORT' | 'RETURN' | 'REMOVE_VEHICLE' | 'DAILY_CHECK' | 'ADMIN_REVIEW'

export interface DamageTaskFields {
  taskName: string
  notes: string | null
  reportedById: string | null
  rigId?: string | null
  repairType?: RepairType | null
  shopName?: string | null
  shopAddress?: string | null
  dateDelivered?: Date | null
  purchaseOrder?: string | null
  invoiceNumber?: string | null
  repairHubId?: string | null
  /** Already filtered through `filterAllowedPhotoUrls`. */
  photoUrls?: string[]
  /** DAMAGE_REPORTED metadata (`vehicleName` / `itemName`, `operatorId`). */
  alertMeta?: Record<string, string | number | boolean | null>
  source: DamageSource
  /** `!stillUsable`: pull the asset out of service. A "Still usable" report leaves it as it is (D29). */
  pull: boolean
}

const RINGS_THE_BELL: Record<DamageSource, boolean> = {
  REPORT: true,
  RETURN: true,
  REMOVE_VEHICLE: true,
  DAILY_CHECK: false,
  ADMIN_REVIEW: false,
}

function openTaskWhere(asset: DamageAsset): Prisma.MaintenanceTaskWhereInput | null {
  if (asset.kind === 'vehicle') return { ...OPEN_TASK, isDamageReport: true, vehicleId: asset.id, inventoryUnitId: null }
  if (asset.kind === 'unit') return { ...OPEN_TASK, isDamageReport: true, inventoryUnitId: asset.id }
  return null
}

/**
 * Open (or join) the damage task for an asset. If one is already open, the new
 * report's notes and photos are appended to it and it is returned; otherwise a
 * task is created and — unless the source is admin triage — DAMAGE_REPORTED is
 * raised. The asset is pulled for repair only when `pull` is true.
 */
export async function openDamageTask(
  tx: Tx,
  asset: DamageAsset,
  f: DamageTaskFields,
): Promise<{ task: { id: string }; created: boolean }> {
  const where = openTaskWhere(asset)
  const existing = where
    ? await tx.maintenanceTask.findFirst({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, notes: true } })
    : null

  let task: { id: string }
  let created = false
  if (existing) {
    const added = f.notes?.trim()
    if (added) {
      await tx.maintenanceTask.update({
        where: { id: existing.id },
        data: { notes: existing.notes ? `${existing.notes}\n\n— ${f.taskName}: ${added}` : added },
      })
    }
    task = existing
  } else {
    task = await tx.maintenanceTask.create({
      data: {
        taskName: f.taskName,
        isDamageReport: true,
        status: 'IN_PROGRESS',
        notes: f.notes,
        reportedById: f.reportedById,
        rigId: f.rigId ?? null,
        repairType: f.repairType ?? null,
        shopName: f.shopName ?? null,
        shopAddress: f.shopAddress ?? null,
        dateDelivered: f.dateDelivered ?? null,
        purchaseOrder: f.purchaseOrder ?? null,
        invoiceNumber: f.invoiceNumber ?? null,
        repairHubId: f.repairHubId ?? null,
        vehicleId: asset.kind === 'vehicle' ? asset.id : null,
        inventoryUnitId: asset.kind === 'unit' ? asset.id : null,
        itemId: asset.kind === 'vehicle' ? null : asset.itemId ?? null,
      },
      select: { id: true },
    })
    created = true
    if (RINGS_THE_BELL[f.source]) {
      await createAlert('DAMAGE_REPORTED', 'maintenance_tasks', task.id, f.alertMeta ?? {}, tx)
    }
  }

  const uploadedById = f.reportedById
  if (uploadedById && f.photoUrls && f.photoUrls.length > 0) {
    await tx.photo.createMany({
      data: f.photoUrls.map((url) => ({
        url,
        context: 'DAMAGE' as const,
        maintenanceId: task.id,
        vehicleId: asset.kind === 'vehicle' ? asset.id : null,
        inventoryItemId: asset.kind === 'vehicle' ? null : asset.itemId ?? null,
        uploadedById,
      })),
    })
  }

  if (f.pull && asset.kind !== 'item') await pullForRepair(tx, asset)
  return { task, created }
}

export type CloseReason = 'COMPLETED' | 'FIELD_FIX' | 'DELETED' | 'RETIRED' | 'REOPEN'

export interface CloseExtra {
  actualCost?: Prisma.Decimal | number | null
  notes?: string | null
  returnDestinationType?: ReturnDestinationType | null
  returnDestinationId?: string | null
  repairMethod?: RepairMethod | null
}

/**
 * The asset a damage task holds. A task linked to a unit holds that unit; a
 * vehicle-only task holds the vehicle; a legacy item-only task (UR-029, created
 * before the unit was linked) holds the item's one IN_MAINTENANCE unit when it is
 * unambiguous, and nothing otherwise — never guess which unit to free.
 */
async function assetOf(
  tx: Tx,
  task: { vehicleId: string | null; inventoryUnitId: string | null; itemId: string | null },
): Promise<AssetRef | null> {
  if (task.inventoryUnitId) return { kind: 'unit', id: task.inventoryUnitId }
  if (task.vehicleId) return { kind: 'vehicle', id: task.vehicleId }
  if (task.itemId) {
    const inMaint = await tx.inventoryUnit.findMany({
      where: { inventoryItemId: task.itemId, status: 'IN_MAINTENANCE' },
      select: { id: true },
      take: 2,
    })
    if (inMaint.length === 1) return { kind: 'unit', id: inMaint[0].id }
  }
  return null
}

/**
 * Close (or reopen) a damage task and settle its asset. `MaintenanceStatus` has
 * one terminal state, so COMPLETED / FIELD_FIX / RETIRED all write COMPLETED
 * (FIELD_FIX adds `resolutionPath: IN_FIELD`; RETIRED notes "Unit retired" or
 * "Vehicle retired");
 * DELETED soft-deletes. The task is closed BEFORE the restore check, its alerts
 * are resolved, and the asset goes back to service only if no other open report
 * holds it (`restoreIfClear`). REOPEN puts the task back IN_PROGRESS and pulls the
 * asset again (U-7: "Reopen" used to leave the vehicle Active).
 */
export async function closeDamageTask(
  tx: Tx,
  taskId: string,
  reason: CloseReason,
  extra: CloseExtra = {},
): Promise<{ id: string }> {
  const task = await tx.maintenanceTask.findUniqueOrThrow({
    where: { id: taskId },
    select: { id: true, notes: true, vehicleId: true, inventoryUnitId: true, itemId: true },
  })
  const asset = await assetOf(tx, task)
  const now = new Date()

  if (reason === 'REOPEN') {
    const reopened = await tx.maintenanceTask.update({
      where: { id: taskId },
      data: { status: 'IN_PROGRESS', completedAt: null },
      select: { id: true },
    })
    if (asset) await pullForRepair(tx, asset)
    return reopened
  }

  const data: Prisma.MaintenanceTaskUpdateInput =
    reason === 'DELETED'
      ? { deletedAt: now }
      : { status: 'COMPLETED', completedAt: now, lastCompleted: now }
  if (reason === 'FIELD_FIX') data.resolutionPath = 'IN_FIELD'
  if (reason === 'RETIRED') {
    data.notes = [task.notes, extra.notes, task.inventoryUnitId ? 'Unit retired' : task.vehicleId ? 'Vehicle retired' : 'Retired'].filter((s) => s && s.trim()).join('\n')
  } else if (extra.notes) {
    data.notes = extra.notes
  }
  if (extra.actualCost != null) data.actualCost = extra.actualCost
  if (extra.returnDestinationType !== undefined) data.returnDestinationType = extra.returnDestinationType
  if (extra.returnDestinationId !== undefined) data.returnDestinationId = extra.returnDestinationId
  if (extra.repairMethod !== undefined) data.repairMethod = extra.repairMethod

  const closed = await tx.maintenanceTask.update({ where: { id: taskId }, data, select: { id: true } })
  await resolveAlertsFor('maintenance_tasks', taskId, tx)
  if (asset) await restoreIfClear(tx, asset, { excludeTaskId: taskId })
  return closed
}
