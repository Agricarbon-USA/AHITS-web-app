import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { photoUrlsField, isPhotoNotUploadedError } from '@/lib/validation'
import { prisma } from '@/lib/prisma'
import { getAuthorizedActiveRig } from '@/lib/deployment-auth'
import { getActivePrimaryForRig, getRequiredPrimaryForRig, hydrateRigOperator } from '@/lib/deployment-assignments'
import { requireAuth } from '@/lib/auth/session'
import { returnConditionToLogCondition, getUnitsInOtherRigs } from '@/lib/check-log-helpers'
import { createAlert } from '@/lib/alerts'
import { withIdempotency } from '@/lib/idempotency'
import { issueHubReturnLinks } from '@/lib/status-links'
import { filterAllowedPhotoUrls } from '@/lib/photo-security'
import { drawFromHub, getStockAtHub, restoreToHub, resyncItemTotal } from '@/lib/inventory-stock'
import { claimHeldStock } from '@/lib/deployment-requests'
import { markInoperable, pickUnit, pickableFirst, releaseUnlinkedReturns, returnUnit } from '@/lib/asset-status'
import { PICKABLE_UNIT } from '@/lib/populations'
import { openDamageTask } from '@/lib/maintenance'

const RIG_INCLUDE = {
  project: { select: { id: true, name: true } },
  vehicles: {
    where: { removedAt: null },
    include: { vehicle: { select: { id: true, name: true, type: true } } },
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

const addSchema = z.object({
  items: z.array(z.union([
    z.object({
      itemType: z.literal('CONSUMABLE'),
      inventoryItemId: z.string(),
      quantity: z.number().int().min(1),
    }),
    z.object({
      itemType: z.literal('SERIALIZED'),
      inventoryItemId: z.string(),
      inventoryUnitId: z.string(),
    }),
  ])).min(1),
  // Optional: adding a tool mid-deployment shouldn't require typing a note
  // (low-friction field use). A note still flows to the check-out log when given.
  note: z.string().optional(),
  photoUrls: photoUrlsField(), // CC-29 item 7b: reject unresolved localphoto: refs (422)
  // Required when any item is CONSUMABLE — identifies which hub to draw from.
  sourceHubId: z.string().optional(),
})

const dispositionSchema = z.object({
  kitItemId: z.string(),
  type: z.enum(['HUB', 'TRANSFER', 'INOPERABLE']),
  quantity: z.number().int().min(1).optional(), // partial removal for consumables
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
  // G1: a "Return to Hub" disposition must name a destination hub, else the
  // per-hub stock credit is skipped and the quantity vanishes from hub views.
  if (v.type === 'HUB' && !v.hubId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A return hub is required', path: ['hubId'] })
  }
  // UXP-3 (3g) / D36: an INOPERABLE disposition no longer requires a damage photo — a
  // denied/missing camera must never block a submit. (photoUrlsField still 422s an
  // unresolved localphoto: ref.)
})

const removeSchema = z.object({
  note: z.string().optional(), // CC-24: optional (was min(1))
  itemDispositions: z.array(dispositionSchema).min(1),
})


export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withIdempotency(req, 'deployments.items.POST', () => _POST(req, ctx))
}

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const rig = await getAuthorizedActiveRig(id, session)
  if (!rig) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 })
  // W0-10 PR-1: attribution operator = the deployment's PRIMARY (roster) with legacy
  // fallback — behavior-preserving (legacy used rig.operatorId = the primary). Whether
  // CheckLog should instead record the ACTING user is a separate product question.
  const primaryId = await getRequiredPrimaryForRig(id)

  const body = await req.json()
  const parsed = addSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: isPhotoNotUploadedError(parsed.error) ? 422 : 400 }) // CC-29 item 7b: localphoto ref -> 422

  const { items, note, photoUrls, sourceHubId } = parsed.data
  const kit = await prisma.kit.findFirst({ where: { rigId: id } })
  if (!kit) return NextResponse.json({ error: 'Kit not found' }, { status: 404 })

  try {
    await prisma.$transaction(async (tx) => {
      for (const entry of items) {
        if (entry.itemType === 'SERIALIZED') {
          // PR-3a (D-e / D-n): `pickUnit` takes AVAILABLE or Returning (IN_TRANSIT) units —
          // a Returning unit's open hub-return link is completed — guarded so a unit taken by
          // a concurrent checkout is refused rather than double-allocated.
          const picked = await pickUnit(tx, entry.inventoryUnitId, { inventoryItemId: entry.inventoryItemId, actorLabel: session.name })
          if (!picked) {
            throw Object.assign(new Error('UNIT_CONFLICT'), { unitId: entry.inventoryUnitId })
          }
          await tx.kitItem.create({
            data: {
              kitId: kit.id,
              inventoryItemId: entry.inventoryItemId,
              quantity: 1,
              inventoryUnitId: entry.inventoryUnitId,
            },
          })
          await tx.checkLog.create({
            data: {
              action: 'CHECK_OUT',
              itemId: entry.inventoryItemId,
              inventoryUnitId: entry.inventoryUnitId,
              operatorId: session.userId,
              rigId: id,
              projectId: rig.projectId ?? undefined,
              notes: note,
            },
          })
        } else {
          const invItem = await tx.inventoryItem.findUnique({
            where: { id: entry.inventoryItemId },
            select: { itemType: true },
          })
          // SERIALIZED items added by quantity must reserve that many real AVAILABLE
          // units. CONSUMABLE quantity is authoritative and may have no units.
          const requireUnits = invItem?.itemType === 'SERIALIZED'
          // Pickable units (PICKABLE_STATUSES), AVAILABLE first so a Returning unit's hub
          // link is only completed when the shelf can't cover the quantity.
          const availableUnits = pickableFirst(await tx.inventoryUnit.findMany({
            where: { inventoryItemId: entry.inventoryItemId, ...PICKABLE_UNIT },
            select: { id: true, status: true },
          })).slice(0, entry.quantity)
          if (requireUnits && availableUnits.length < entry.quantity) {
            throw Object.assign(new Error('INSUFFICIENT_UNITS'), {
              available: availableUnits.length,
              requested: entry.quantity,
            })
          }
          // Status-guarded pick per unit: a unit taken by a concurrent checkout between
          // this read and write is refused, not double-allocated.
          for (const u of availableUnits) {
            if (!(await pickUnit(tx, u.id, { actorLabel: session.name }))) {
              throw Object.assign(new Error('UNIT_CONFLICT'), {})
            }
          }
          // CONSUMABLE stock: draw from the selected hub (MH-1). Hard fail on
          // insufficient — operator must pick another hub or reduce qty.
          // Dual-write: hub row (authoritative) + InventoryItem.quantity (total).
          let drawnQuantity = 0
          let drawnHubId: string | null = null
          if (invItem?.itemType === 'CONSUMABLE') {
            if (!sourceHubId) {
              throw Object.assign(new Error('CONSUMABLE_NEEDS_HUB'), {})
            }
            // UR-010: claim this rig operator's own HELD (reserved) stock at this hub
            // first — converts reserve→draw — then draw any remainder from free stock.
            // Normal reservation checkout: claimed === quantity, no free draw. Direct
            // (no-reservation) add: claimed === 0, it all comes from free stock.
            const claimed = await claimHeldStock(primaryId, entry.inventoryItemId, sourceHubId, entry.quantity, tx)
            const remainder = entry.quantity - claimed
            if (remainder > 0) {
              const drawn = await drawFromHub(entry.inventoryItemId, sourceHubId, remainder, tx)
              if (drawn < remainder) {
                const atHub = await getStockAtHub(entry.inventoryItemId, sourceHubId, tx)
                const hubRow = await tx.hub.findUnique({ where: { id: sourceHubId }, select: { name: true } })
                throw Object.assign(new Error('INSUFFICIENT_HUB_STOCK'), {
                  available: claimed + atHub,
                  requested: entry.quantity,
                  hubName: hubRow?.name ?? sourceHubId,
                })
              }
            }
            // Recompute the cross-hub total from stock rows — covers both the claimed
            // reserve→draw and the free-stock draw in one authoritative pass.
            await resyncItemTotal(entry.inventoryItemId, tx)
            drawnQuantity = entry.quantity
            drawnHubId = sourceHubId
          }
          await tx.kitItem.create({
            data: {
              kitId: kit.id,
              inventoryItemId: entry.inventoryItemId,
              quantity: entry.quantity,
              inventoryUnitId: null,
              drawnQuantity,
              drawnHubId,
            },
          })
          await tx.checkLog.create({
            data: {
              action: 'CHECK_OUT',
              itemId: entry.inventoryItemId,
              operatorId: session.userId,
              rigId: id,
              projectId: rig.projectId ?? undefined,
              notes: note,
            },
          })
        }
      }

      if (photoUrls.length > 0) {
        await tx.photo.createMany({
          data: filterAllowedPhotoUrls(photoUrls).map((url) => ({
            url,
            context: 'INVENTORY_REFERENCE' as const,
            uploadedById: session.userId,
          })),
        })
      }
    })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'CONSUMABLE_NEEDS_HUB') {
      return NextResponse.json(
        { error: 'A source hub is required when checking out consumable items.' },
        { status: 400 }
      )
    }
    if (err instanceof Error && err.message === 'INSUFFICIENT_HUB_STOCK') {
      const e = err as Error & { available?: number; requested?: number; hubName?: string }
      return NextResponse.json(
        { error: `Only ${e.available ?? 0} available at ${e.hubName ?? 'the selected hub'} (requested ${e.requested ?? 0}).` },
        { status: 409 }
      )
    }
    if (err instanceof Error && err.message === 'UNIT_CONFLICT') {
      return NextResponse.json(
        { error: 'This unit was just checked out by someone else. Please select a different unit and try again.' },
        { status: 409 }
      )
    }
    if (err instanceof Error && err.message === 'INSUFFICIENT_UNITS') {
      const e = err as Error & { available?: number; requested?: number }
      return NextResponse.json(
        { error: `Only ${e.available ?? 0} of ${e.requested ?? 0} units available for this item.` },
        { status: 409 }
      )
    }
    // Unexpected error (e.g. transient DB failure) → 500 so the offline queue
    // RETRIES it. Returning 409 here would make the queue treat it as a
    // terminal client error and silently drop the write.
    const msg = err instanceof Error ? err.message : 'Checkout failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const updated = await prisma.rig.findUniqueOrThrow({ where: { id }, include: RIG_INCLUDE })
  return NextResponse.json(await hydrateRigOperator(updated))
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withIdempotency(req, 'deployments.items.DELETE', () => _DELETE(req, ctx))
}

async function _DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const rig = await getAuthorizedActiveRig(id, session)
  if (!rig) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 })
  // W0-10 PR-1: attribution operator = the deployment's PRIMARY (roster) with legacy
  // fallback — behavior-preserving (legacy used rig.operatorId = the primary). Whether
  // CheckLog should instead record the ACTING user is a separate product question.
  const primaryId = await getRequiredPrimaryForRig(id)

  const body = await req.json()
  const parsed = removeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: isPhotoNotUploadedError(parsed.error) ? 422 : 400 }) // CC-29 item 7b: localphoto ref -> 422

  const { note, itemDispositions } = parsed.data
  const now = new Date()

  const kitItemIds = itemDispositions.map((d) => d.kitItemId)
  const kitItems = await prisma.kitItem.findMany({
    where: { id: { in: kitItemIds }, removedAt: null },
    include: {
      item: { select: { id: true, name: true, itemType: true, hubId: true } },
      inventoryUnit: true,
    },
  })

  // Serialized units that went Returning inside the transaction — their HUB_RETURN links
  // are issued after commit (with a fallback to AVAILABLE if that fails).
  const returning: { kitItemId: string; unitId: string; hubId: string }[] = []

  try {
    await prisma.$transaction(async (tx) => {
    for (const disp of itemDispositions) {
      const kitItem = kitItems.find((ki) => ki.id === disp.kitItemId)
      if (!kitItem) continue
      const inventoryItemId = kitItem.inventoryItemId
      const isSerialized = kitItem.item.itemType === 'SERIALIZED'

      // Partial removal: consumables can return a subset of quantity
      const removeQty = isSerialized ? 1 : Math.min(disp.quantity ?? kitItem.quantity, kitItem.quantity)
      const fullRemoval = isSerialized || removeQty >= kitItem.quantity

      // A-1 / CR-17: claim the removal conditionally so two concurrent bulk returns
      // of the SAME kit item can't both restore stock. The loser matches 0 rows and
      // skips this disposition (the winner already did the return + logs). The partial
      // branch also decrements drawnQuantity so a later partial return can't over-restore.
      // TRANSFER removal is finalized only when the recipient ACCEPTS (the
      // transfer/accept route decrements the source kit item then). Mutating it here
      // too would double-decrement — so, exactly like end/route.ts, skip the kit-item
      // mutation (and the claim) for TRANSFER dispositions.
      const drawn = kitItem.drawnQuantity ?? 0
      let restoreQty = 0
      if (disp.type !== 'TRANSFER') {
        if (fullRemoval) {
          const claimed = await tx.kitItem.updateMany({
            where: { id: disp.kitItemId, removedAt: null },
            data: { removedAt: now },
          })
          if (claimed.count === 0) continue
          restoreQty = drawn
        } else {
          restoreQty = Math.min(removeQty, drawn)
          const claimed = await tx.kitItem.updateMany({
            where: { id: disp.kitItemId, removedAt: null, quantity: { gte: removeQty } },
            data: { quantity: { decrement: removeQty }, drawnQuantity: { decrement: restoreQty } },
          })
          if (claimed.count === 0) continue
        }
      }

      if (disp.type === 'HUB') {
        if (kitItem.item.itemType === 'CONSUMABLE' && (disp.returnCondition ?? 'GOOD') === 'GOOD') {
          // Consumable returned to the hub in usable condition → restore exactly
          // the stock drawn at check-out, capped at what's left to restore, so
          // on-hand can't overshoot the true total (CR-1a / N-2). Damaged/
          // maintenance returns are not restored (the stock isn't usable).
          // Dual-write (UR-001): restore the per-hub `inventory_stock` row (MH-1)
          // AND the cross-hub `inventory_items.quantity` total — exactly like the
          // end-of-deployment and single-item return paths. Restoring only the
          // total (the previous behaviour) silently drifted per-hub stock down on
          // every bulk return. Legacy null drawnHubId falls back to item.hubId;
          // if still null, skip the hub row but always restore the total so no
          // stock is lost.
          // G1: chosen destination hub wins, then drawn hub, then home hub.
          const hubForRestore = disp.hubId ?? kitItem.drawnHubId ?? kitItem.item.hubId
          if (hubForRestore && restoreQty > 0) {
            await restoreToHub(inventoryItemId, hubForRestore, restoreQty, tx)
          }
          if (restoreQty > 0) {
            await resyncItemTotal(inventoryItemId, tx)
          }
        }
        await tx.checkLog.create({
          data: {
            action: 'CHECK_IN',
            itemId: inventoryItemId,
            inventoryUnitId: kitItem.inventoryUnitId ?? undefined,
            operatorId: primaryId,
            rigId: id,
            notes: note,
            condition: returnConditionToLogCondition(disp.returnCondition),
          },
        })

        // PR-3a: the one return rule (`returnUnit`) — the same as end of deployment. GOOD →
        // Returning (IN_TRANSIT) with its hub link; damaged → an open damage task that pulls
        // the unit; already in repair → stays in repair, this hub recorded as its
        // destination (D-d). This path used to write AVAILABLE for every condition, freeing
        // out-of-service units (S-2). Anonymous units can't carry a link: GOOD → AVAILABLE.
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
            take: removeQty,
          })
          for (const u of units) {
            await returnUnit(tx, u.id, { condition, hubId: disp.hubId, linked: false, task: damageTask })
          }
        }
        if (disp.hubId) {
          await tx.inventoryItem.update({ where: { id: inventoryItemId }, data: { hubId: disp.hubId } })
        }
      } else if (disp.type === 'INOPERABLE') {
        const logCondition =
          disp.canBeFixed === true ? 'NEEDS_REPAIR' : 'MISSING_PARTS'

        await tx.checkLog.create({
          data: {
            action: 'CHECK_IN',
            itemId: inventoryItemId,
            inventoryUnitId: kitItem.inventoryUnitId ?? undefined,
            operatorId: primaryId,
            rigId: id,
            notes: note,
            condition: logCondition,
          },
        })
        const targetUnit = kitItem.inventoryUnit
          ? kitItem.inventoryUnit
          : (await tx.inventoryUnit.findFirst({ where: { inventoryItemId, status: 'CHECKED_OUT' } }))
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
    }

    // TRANSFER: group by toOperatorId
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
          items: { create: disps.map((d) => ({ kitItemId: d.kitItemId, quantity: d.quantity })) },
        },
      })
    }
    }) // end transaction
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to process items'
    console.error('[DELETE /api/deployments/[id]/items]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Wave F-R (soft-gate, best-effort, non-blocking): issue a HUB_RETURN status link for
  // each unit that went Returning, so the hub can confirm receipt (the unit stays
  // pickable meanwhile — D-e). If issuance fails, those units fall back to AVAILABLE
  // rather than sit Returning with no link; the return itself has already committed.
  try {
    await issueHubReturnLinks(session.userId, returning.map(({ kitItemId, hubId }) => ({ kitItemId, hubId })))
  } catch (e) {
    console.error('[items hub-return link issue]', e)
    await releaseUnlinkedReturns(returning.map((r) => r.unitId)).catch(() => {})
  }

  const updated = await prisma.rig.findUniqueOrThrow({ where: { id }, include: RIG_INCLUDE })
  return NextResponse.json(await hydrateRigOperator(updated))
}
