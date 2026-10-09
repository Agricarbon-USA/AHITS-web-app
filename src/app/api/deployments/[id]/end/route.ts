import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { photoUrlsField, isPhotoNotUploadedError } from '@/lib/validation'
import { prisma } from '@/lib/prisma'
import { isAuthorizedForRig } from '@/lib/deployment-auth'
import { requireAuth } from '@/lib/auth/session'
import { returnConditionToLogCondition, getUnitsInOtherRigs } from '@/lib/check-log-helpers'
import { createAlert, resolveAlertsFor } from '@/lib/alerts'
import { withIdempotency } from '@/lib/idempotency'
import { issueHubReturnLinks } from '@/lib/status-links'
import { filterAllowedPhotoUrls } from '@/lib/photo-security'
import { endAllAssignmentsForRig, removeAllProjectLinks } from '@/lib/deployment-assignments'
import { restoreToHub, resyncItemTotal } from '@/lib/inventory-stock'
import { markInoperable, releaseUnlinkedReturns, returnUnit } from '@/lib/asset-status'
import { openDamageTask } from '@/lib/maintenance'

const dispositionSchema = z.object({
  kitItemId: z.string(),
  type: z.enum(['HUB', 'TRANSFER', 'INOPERABLE']),
  returnCondition: z.enum(['GOOD', 'IN_MAINTENANCE', 'INOPERABLE']).optional(),
  hubId: z.string().optional(),
  toOperatorId: z.string().optional(),
  canBeFixed: z.boolean().optional(),
  repairType: z.enum(['IN_FIELD', 'AT_SHOP', 'SHIP_TO_HUB', 'SHIP_FOR_REPAIR']).optional(),
  shopName: z.string().optional(),
  shopAddress: z.string().optional(),
  dateDelivered: z.string().optional(),
  purchaseOrder: z.string().optional(),
  invoiceNumber: z.string().optional(),
  repairHubId: z.string().optional(),
  inoperableNotes: z.string().optional(),
  photoUrls: photoUrlsField(), // CC-29 item 7b: reject unresolved localphoto: refs (422)
}).superRefine((v, ctx) => {
  // G1: a "Return to Hub" disposition must name a destination hub. Without it the
  // server skips the per-hub stock credit and the quantity vanishes from hub
  // views ("disappeared"/"HQ"). Required at the boundary so no path can lose stock.
  if (v.type === 'HUB' && !v.hubId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A return hub is required', path: ['hubId'] })
  }
  // UXP-3 (3g) / D36: an INOPERABLE disposition no longer requires a damage photo — a
  // denied/missing camera must never block a submit. (photoUrlsField still 422s an
  // unresolved localphoto: ref.)
})

const schema = z.object({
  note: z.string().optional(), // CC-24: optional (was min(1))
  itemDispositions: z.array(dispositionSchema).default([]),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withIdempotency(req, 'deployments.end.POST', () => _POST(req, ctx))
}

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const rig = await prisma.rig.findUnique({
    where: { id },
    include: {
      kits: {
        include: {
          items: {
            where: { removedAt: null },
            include: {
              item: { select: { id: true, name: true, itemType: true, hubId: true } },
              inventoryUnit: true,
            },
          },
        },
      },
      vehicles: { where: { removedAt: null } },
    },
  })
  if (!rig) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await isAuthorizedForRig(rig, session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (rig.endedAt) return NextResponse.json({ error: 'Deployment already ended' }, { status: 409 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: isPhotoNotUploadedError(parsed.error) ? 422 : 400 }) // CC-29 item 7b: localphoto ref -> 422

  const { note } = parsed.data
  let { itemDispositions } = parsed.data
  const now = new Date()
  const allKitItems = rig.kits.flatMap((k) => k.items)

  // Auto-fill items with no explicit disposition: default to returning to the item's
  // home hub in GOOD condition. If an item has no home hub, we can't safely route it —
  // return 400 so the client can provide an explicit disposition rather than losing stock.
  const dispMap = new Map(itemDispositions.map((d) => [d.kitItemId, d]))
  const autoDispositions: typeof itemDispositions = []
  for (const ki of allKitItems) {
    if (dispMap.has(ki.id)) continue
    const hubId = ki.item.hubId
    if (!hubId) {
      return NextResponse.json(
        { error: `Item "${ki.item.name}" has no disposition and no home hub — provide an explicit disposition.` },
        { status: 400 },
      )
    }
    autoDispositions.push({ kitItemId: ki.id, type: 'HUB', hubId, returnCondition: 'GOOD', photoUrls: [] })
  }
  if (autoDispositions.length > 0) itemDispositions = [...itemDispositions, ...autoDispositions]

  // Serialized units that went Returning (IN_TRANSIT) inside the transaction: their
  // HUB_RETURN links are issued after it commits, and if that fails they fall back to
  // AVAILABLE so they aren't stranded. Only these get links — a damaged return is in
  // repair, not on its way to a hub shelf (C-2: Inbound counted phantom returns).
  const returning: { kitItemId: string; unitId: string; hubId: string }[] = []

  await prisma.$transaction(async (tx) => {
    await tx.rig.update({ where: { id }, data: { endedAt: now, notes: note } })
    await endAllAssignmentsForRig(id, tx)
    await removeAllProjectLinks(id, tx)

    for (const disp of itemDispositions) {
      const kitItem = allKitItems.find((ki) => ki.id === disp.kitItemId)
      if (!kitItem) continue
      const inventoryItemId = kitItem.inventoryItemId

      // TRANSFER items keep removedAt: null until the transfer is accepted/declined
      if (disp.type !== 'TRANSFER') {
        await tx.kitItem.update({ where: { id: disp.kitItemId }, data: { removedAt: now } })
      }

      if (disp.type === 'HUB') {
        if (kitItem.item.itemType === 'CONSUMABLE' && (disp.returnCondition ?? 'GOOD') === 'GOOD') {
          // Restore exactly the stock drawn at check-out (CR-1a / N-2).
          // G1: the operator-chosen destination hub wins, then the drawn hub,
          // then the item's home hub. hubId is required for HUB (schema refine),
          // so this is never null and the per-hub credit always lands somewhere.
          const hubForRestore = disp.hubId ?? kitItem.drawnHubId ?? kitItem.item.hubId
          if (hubForRestore && kitItem.drawnQuantity > 0) {
            await restoreToHub(inventoryItemId, hubForRestore, kitItem.drawnQuantity, tx)
            // #106: recompute the cross-hub total from the stock rows (one discipline for
            // every return path) instead of a blind increment — self-heals any drift and
            // can't credit the total without a backing per-hub row (A-2/A-3).
            await resyncItemTotal(inventoryItemId, tx)
          }
        }
        const logCondition =
          disp.type === 'HUB' ? returnConditionToLogCondition(disp.returnCondition) : null

        await tx.checkLog.create({
          data: {
            action: 'CHECK_IN',
            itemId: inventoryItemId,
            inventoryUnitId: kitItem.inventoryUnit?.id ?? undefined,
            operatorId: session.userId,
            rigId: id,
            notes: note,
            condition: logCondition,
          },
        })
        // PR-3a: the one return rule (`returnUnit`). GOOD → Returning (IN_TRANSIT) with its
        // hub link issued after commit; IN_MAINTENANCE / INOPERABLE → an open damage task
        // that pulls the unit (it used to flip with no task — S-2/C-2); a unit already in
        // repair stays in repair with this hub recorded as where it went (D-d). Anonymous
        // units (no unit on the kit line) can't carry a link, so a GOOD one is AVAILABLE.
        const condition = disp.returnCondition ?? 'GOOD'
        const damageTask = {
          itemId: inventoryItemId,
          taskName: `Damage repair: ${kitItem.item.name}`,
          notes: note ?? null,
          rigId: id,
          reportedById: session.userId,
          alertMeta: { itemName: kitItem.item.name, operatorId: session.userId },
        }
        if (kitItem.inventoryUnit) {
          const ended = await returnUnit(tx, kitItem.inventoryUnit.id, {
            condition,
            hubId: disp.hubId,
            linked: true,
            task: damageTask,
          })
          if (ended === 'IN_TRANSIT' && disp.hubId) {
            returning.push({ kitItemId: kitItem.id, unitId: kitItem.inventoryUnit.id, hubId: disp.hubId })
          }
        } else {
          const excludeUnitIds = await getUnitsInOtherRigs(tx, inventoryItemId, id)
          const units = await tx.inventoryUnit.findMany({
            where: {
              inventoryItemId,
              status: 'CHECKED_OUT',
              ...(excludeUnitIds.length > 0 && { id: { notIn: excludeUnitIds } }),
            },
            take: kitItem.quantity,
          })
          for (const u of units) {
            await returnUnit(tx, u.id, { condition, hubId: disp.hubId, linked: false, task: damageTask })
          }
        }

        if (disp.hubId) {
          await tx.inventoryItem.update({ where: { id: inventoryItemId }, data: { hubId: disp.hubId } })
        }
      } else if (disp.type === 'INOPERABLE') {
        const logCondition = disp.canBeFixed === true ? 'NEEDS_REPAIR' : 'MISSING_PARTS'

        await tx.checkLog.create({
          data: {
            action: 'CHECK_IN',
            itemId: inventoryItemId,
            inventoryUnitId: kitItem.inventoryUnit?.id ?? undefined,
            operatorId: session.userId,
            rigId: id,
            notes: note,
            condition: logCondition,
          },
        })
        const targetUnit = kitItem.inventoryUnit
          ?? (await tx.inventoryUnit.findFirst({ where: { inventoryItemId, status: 'CHECKED_OUT' } }))
        const photoUrls = filterAllowedPhotoUrls(disp.photoUrls)
        if (disp.canBeFixed) {
          // PR-3a: the repair goes through `openDamageTask` (pulls the unit; joins an
          // already-open report on it rather than starting a second).
          if (targetUnit) {
            await tx.inventoryUnit.update({
              where: { id: targetUnit.id },
              data: {
                inoperableNotes: disp.inoperableNotes ?? null,
                inoperableReportedAt: now,
                inoperableReportedById: session.userId,
              },
            })
          }
          // UR-029: link the specific unit so completing the repair returns THIS unit to
          // service. CC-34 (1b): the deployment this damage came from + who reported it.
          await openDamageTask(
            tx,
            targetUnit ? { kind: 'unit', id: targetUnit.id, itemId: inventoryItemId } : { kind: 'item', itemId: inventoryItemId },
            {
              taskName: `Damage repair: ${kitItem.item.name}`,
              notes: null,
              repairType: disp.repairType ?? null,
              shopName: disp.shopName ?? null,
              shopAddress: disp.shopAddress ?? null,
              dateDelivered: disp.dateDelivered ? new Date(disp.dateDelivered) : null,
              purchaseOrder: disp.purchaseOrder ?? null,
              invoiceNumber: disp.invoiceNumber ?? null,
              repairHubId: disp.repairHubId ?? null,
              rigId: id,
              reportedById: session.userId,
              photoUrls,
              alertMeta: { itemName: kitItem.item.name, operatorId: session.userId },
              source: 'RETURN',
              pull: true,
            },
          )
        } else {
          if (targetUnit) {
            await markInoperable(tx, targetUnit.id, {
              notes: disp.inoperableNotes ?? null,
              reportedById: session.userId,
              at: now,
            })
            // CC-34 (1c): ring the bell on an inoperable flip so triage happens before
            // someone opens the maintenance page. review-inoperable clears this same
            // ('inventory_units', unitId) key on RETIRE or REPAIR. Scoped to a real unit.
            await createAlert('DAMAGE_REPORTED', 'inventory_units', targetUnit.id, {
              itemName: kitItem.item.name,
              operatorId: session.userId,
            }, tx)
          }
          if (photoUrls.length > 0) {
            await tx.photo.createMany({
              data: photoUrls.map((url) => ({
                url,
                context: 'DAMAGE' as const,
                inventoryItemId,
                uploadedById: session.userId,
              })),
            })
          }
        }
      }
      // TRANSFER: handled below after all items processed
    }

    // Group TRANSFER dispositions by toOperatorId → one TransferRequest per operator
    const transferDisps = itemDispositions.filter((d) => d.type === 'TRANSFER' && d.toOperatorId)
    const byOperator = new Map<string, typeof transferDisps>()
    for (const d of transferDisps) {
      const key = d.toOperatorId!
      byOperator.set(key, [...(byOperator.get(key) ?? []), d])
    }
    for (const [toOperatorId, disps] of byOperator) {
      await tx.transferRequest.create({
        data: {
          fromRigId: id,
          toOperatorId,
          initiatedById: session.userId,
          note: note ?? '',
          status: 'PENDING',
          items: { create: disps.map((d) => ({ kitItemId: d.kitItemId })) },
        },
      })
    }

    const vehicleIds = rig.vehicles.map((rv) => rv.vehicleId)
    if (vehicleIds.length > 0) {
      await tx.vehicle.updateMany({
        where: { id: { in: vehicleIds } },
        data: { assignedOperatorId: null },
      })
    }
    // W0-10 PR-2b: close the rig's open RigVehicle rows so each vehicle is freed for its
    // next deployment. Previously these were left open on an ended rig and no path could
    // ever close them (the vehicles DELETE route rejects ended rigs), stranding the row
    // forever — which breaks the one-open-RigVehicle-per-vehicle invariant index C (PR-2c)
    // enforces and blocks the routine "reuse this vehicle next time".
    // EXCEPTION: a vehicle with a still-PENDING outbound transfer must keep its source row
    // OPEN — the accept path's stillPresent guard requires removedAt IS NULL to move it to
    // the recipient (mirrors how end skips removedAt for TRANSFER kit items). Closing it
    // would brick the transfer and orphan the vehicle.
    const pendingXfer = await tx.transferRequest.findMany({
      where: { fromRigId: id, status: 'PENDING' },
      select: { vehicles: { select: { vehicleId: true } } },
    })
    const keepOpenVehicleIds = pendingXfer.flatMap((t) => t.vehicles.map((v) => v.vehicleId))
    await tx.rigVehicle.updateMany({
      where: { rigId: id, removedAt: null, vehicleId: { notIn: keepOpenVehicleIds } },
      data: { removedAt: now },
    })
    // PR-3a (S-10): an ended deployment can no longer change hands — cancel its pending
    // operator handoffs (same raw write as the handoff cancel route).
    await tx.$executeRaw`
      UPDATE "deployment_handoffs"
      SET "status" = 'CANCELLED', "updatedAt" = ${now}
      WHERE "rigId" = ${id} AND "status" = 'PENDING'`
  })

  // CC-31 item 2c: ending the deployment returns its equipment, so any per-kit-item
  // EQUIPMENT_NOT_RETURNED alert (raised at /api/daily-check when kit has been out >90d)
  // no longer describes reality — resolve it for every kit item on the ended rig. The
  // key is the same triple the raise uses. Best-effort: a resolve failure must never fail
  // the end (the deployment is already committed above); a fresh 90d-out rig re-raises.
  // PR-4: through resolveAlertsFor, so the alerts' bell rows are marked read too.
  for (const ki of allKitItems) {
    await resolveAlertsFor('kit_items', ki.id).catch(() => {})
  }

  // Wave F-R (soft-gate, best-effort): issue HUB_RETURN confirmation links for the units
  // that went Returning inside the transaction. Non-blocking; if issuance fails, those
  // units fall back to AVAILABLE (through the status module) so they aren't stranded.
  try {
    await issueHubReturnLinks(session.userId, returning.map(({ kitItemId, hubId }) => ({ kitItemId, hubId })))
  } catch (e) {
    console.error('[end hub-return link issue]', e)
    await releaseUnlinkedReturns(returning.map((r) => r.unitId)).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
