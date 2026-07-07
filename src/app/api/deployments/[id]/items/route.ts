import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { returnConditionToLogCondition, getUnitsInOtherRigs } from '@/lib/check-log-helpers'
import { createAlert } from '@/lib/alerts'
import { withIdempotency } from '@/lib/idempotency'
import { issueHubReturnLinks } from '@/lib/status-links'
import { filterAllowedPhotoUrls } from '@/lib/photo-security'
import { drawFromHub, getStockAtHub, restoreToHub, resyncItemTotal } from '@/lib/inventory-stock'
import { claimHeldStock } from '@/lib/deployment-requests'

const RIG_INCLUDE = {
  operator: { select: { id: true, name: true } },
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
  photoUrls: z.array(z.string()).default([]),
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
  photoUrls: z.array(z.string()).default([]),
}).superRefine((v, ctx) => {
  // G1: a "Return to Hub" disposition must name a destination hub, else the
  // per-hub stock credit is skipped and the quantity vanishes from hub views.
  if (v.type === 'HUB' && !v.hubId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A return hub is required', path: ['hubId'] })
  }
  // §11.10 / Phase-2: a damage report requires at least one photo.
  if (v.type === 'INOPERABLE' && v.photoUrls.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one damage photo is required', path: ['photoUrls'] })
  }
})

const removeSchema = z.object({
  note: z.string().min(1, 'Note is required'),
  itemDispositions: z.array(dispositionSchema).min(1),
})

async function getAuthorizedActiveRig(id: string, session: { userId: string; role: string }) {
  const rig = await prisma.rig.findUnique({ where: { id } })
  if (!rig || rig.endedAt) return null
  if (session.role === 'ADMIN') return rig
  if (rig.operatorId === session.userId) return rig
  const secondary = await prisma.rigOperator.findUnique({
    where: { rigId_operatorId: { rigId: id, operatorId: session.userId } },
  })
  if (secondary) return rig
  return null
}

async function getAuthorizedRig(id: string, session: { userId: string; role: string }) {
  const rig = await prisma.rig.findUnique({ where: { id } })
  if (!rig) return null
  if (session.role === 'ADMIN') return rig
  if (rig.operatorId === session.userId) return rig
  const secondary = await prisma.rigOperator.findUnique({
    where: { rigId_operatorId: { rigId: id, operatorId: session.userId } },
  })
  if (secondary) return rig
  return null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withIdempotency(req, 'deployments.items.POST', () => _POST(req, ctx))
}

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const rig = await getAuthorizedActiveRig(id, session)
  if (!rig) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 })

  const body = await req.json()
  const parsed = addSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { items, note, photoUrls, sourceHubId } = parsed.data
  const kit = await prisma.kit.findFirst({ where: { rigId: id } })
  if (!kit) return NextResponse.json({ error: 'Kit not found' }, { status: 404 })

  try {
    await prisma.$transaction(async (tx) => {
      for (const entry of items) {
        if (entry.itemType === 'SERIALIZED') {
          const result = await tx.inventoryUnit.updateMany({
            where: { id: entry.inventoryUnitId, inventoryItemId: entry.inventoryItemId, status: 'AVAILABLE', deletedAt: null },
            data: { status: 'CHECKED_OUT' },
          })
          if (result.count === 0) {
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
          const availableUnits = await tx.inventoryUnit.findMany({
            where: { inventoryItemId: entry.inventoryItemId, status: 'AVAILABLE', deletedAt: null },
            take: entry.quantity,
          })
          if (requireUnits && availableUnits.length < entry.quantity) {
            throw Object.assign(new Error('INSUFFICIENT_UNITS'), {
              available: availableUnits.length,
              requested: entry.quantity,
            })
          }
          if (availableUnits.length > 0) {
            // Status-guarded flip + count reconciliation: a unit taken by a concurrent
            // checkout between this read and write cannot be double-allocated.
            const flipped = await tx.inventoryUnit.updateMany({
              where: { id: { in: availableUnits.map((u) => u.id) }, status: 'AVAILABLE' },
              data: { status: 'CHECKED_OUT' },
            })
            if (flipped.count < availableUnits.length) {
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
            const claimed = await claimHeldStock(rig.operatorId, entry.inventoryItemId, sourceHubId, entry.quantity, tx)
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
  return NextResponse.json(updated)
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

  const body = await req.json()
  const parsed = removeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

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
            await tx.inventoryItem.update({
              where: { id: inventoryItemId },
              data: { quantity: { increment: restoreQty } },
            })
          }
        }
        await tx.checkLog.create({
          data: {
            action: 'CHECK_IN',
            itemId: inventoryItemId,
            inventoryUnitId: kitItem.inventoryUnitId ?? undefined,
            operatorId: rig.operatorId,
            rigId: id,
            notes: note,
            condition: returnConditionToLogCondition(disp.returnCondition),
          },
        })

        if (kitItem.inventoryUnit) {
          await tx.inventoryUnit.update({
            where: { id: kitItem.inventoryUnit.id },
            data: { status: 'AVAILABLE' },
          })
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
          if (units.length > 0) {
            await tx.inventoryUnit.updateMany({
              where: { id: { in: units.map((u) => u.id) } },
              data: { status: 'AVAILABLE' },
            })
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
            operatorId: rig.operatorId,
            rigId: id,
            notes: note,
            condition: logCondition,
          },
        })
        if (disp.canBeFixed) {
          const targetUnit = kitItem.inventoryUnit
            ? kitItem.inventoryUnit
            : (await tx.inventoryUnit.findFirst({ where: { inventoryItemId, status: 'CHECKED_OUT' } }))

          if (targetUnit) {
            await tx.inventoryUnit.update({
              where: { id: targetUnit.id },
              data: {
                status: 'IN_MAINTENANCE',
                inoperableNotes: disp.inoperableNotes ?? null,
                inoperableReportedAt: now,
                inoperableReportedById: session.userId,
              },
            })
          }
          const task = await tx.maintenanceTask.create({
            data: {
              itemId: inventoryItemId,
              // UR-029: link the specific unit so completing the repair returns
              // THIS unit to service (the complete route keys off task.unit).
              inventoryUnitId: targetUnit?.id ?? null,
              taskName: `Damage repair: ${kitItem.item.name}`,
              isDamageReport: true,
              repairType: disp.repairType ?? null,
              shopName: disp.shopName ?? null,
              shopAddress: disp.shopAddress ?? null,
              dateDelivered: disp.dateDelivered ? new Date(disp.dateDelivered) : null,
              purchaseOrder: disp.purchaseOrder ?? null,
              invoiceNumber: disp.invoiceNumber ?? null,
              repairHubId: disp.repairHubId ?? null,
              status: 'IN_PROGRESS',
            },
          })
          await createAlert('DAMAGE_REPORTED', 'maintenance_tasks', task.id, {
            itemName: kitItem.item.name,
            operatorId: session.userId,
          }, tx)
          if (disp.photoUrls.length > 0) {
            await tx.photo.createMany({
              data: filterAllowedPhotoUrls(disp.photoUrls).map((url) => ({
                url,
                context: 'DAMAGE' as const,
                inventoryItemId,
                maintenanceId: task.id,
                uploadedById: session.userId,
              })),
            })
          }
        } else {
          const targetUnit = kitItem.inventoryUnit
            ? kitItem.inventoryUnit
            : (await tx.inventoryUnit.findFirst({ where: { inventoryItemId, status: 'CHECKED_OUT' } }))

          if (targetUnit) {
            await tx.inventoryUnit.update({
              where: { id: targetUnit.id },
              data: {
                status: 'INOPERABLE',
                inoperableNotes: disp.inoperableNotes ?? null,
                inoperableReportedAt: now,
                inoperableReportedById: session.userId,
              },
            })
          }
          if (disp.photoUrls.length > 0) {
            await tx.photo.createMany({
              data: filterAllowedPhotoUrls(disp.photoUrls).map((url) => ({
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
          note,
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

  // Wave F-R (soft-gate, best-effort, non-blocking): for each "Return to Hub" of
  // a serialized unit, issue a HUB_RETURN status link so the hub can confirm
  // receipt. The unit stays AVAILABLE (still re-deployable) — this only records a
  // pending receipt; any failure here never affects the return that committed.
  try {
    const hubDisps = itemDispositions
      .filter((d) => d.type === 'HUB' && d.hubId)
      .map((d) => ({ kitItemId: d.kitItemId, hubId: d.hubId as string }))
    await issueHubReturnLinks(session.userId, hubDisps)
  } catch (e) {
    console.error('[items hub-return link issue]', e)
  }

  const updated = await prisma.rig.findUniqueOrThrow({ where: { id }, include: RIG_INCLUDE })
  return NextResponse.json(updated)
}
