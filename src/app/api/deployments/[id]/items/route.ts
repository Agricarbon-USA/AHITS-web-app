import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { returnConditionToLogCondition, getUnitsInOtherRigs } from '@/lib/check-log-helpers'
import { createAlert } from '@/lib/alerts'
import { withIdempotency } from '@/lib/idempotency'

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
  note: z.string().min(1, 'Note is required'),
  photoUrls: z.array(z.string()).default([]),
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

  const { items, note, photoUrls } = parsed.data
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
          await tx.kitItem.create({
            data: {
              kitId: kit.id,
              inventoryItemId: entry.inventoryItemId,
              quantity: entry.quantity,
              inventoryUnitId: null,
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
          data: photoUrls.map((url) => ({
            url,
            context: 'INVENTORY_REFERENCE' as const,
            uploadedById: session.userId,
          })),
        })
      }
    })
  } catch (err: unknown) {
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
    const msg = err instanceof Error ? err.message : 'Checkout failed'
    return NextResponse.json({ error: msg }, { status: 409 })
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
      item: { select: { id: true, name: true, itemType: true } },
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

      if (fullRemoval) {
        await tx.kitItem.update({ where: { id: disp.kitItemId }, data: { removedAt: now } })
      } else {
        await tx.kitItem.update({
          where: { id: disp.kitItemId },
          data: { quantity: kitItem.quantity - removeQty },
        })
      }

      if (disp.type === 'HUB') {
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
          })
          if (disp.photoUrls.length > 0) {
            await tx.photo.createMany({
              data: disp.photoUrls.map((url) => ({
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
              data: disp.photoUrls.map((url) => ({
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

  const updated = await prisma.rig.findUniqueOrThrow({ where: { id }, include: RIG_INCLUDE })
  return NextResponse.json(updated)
}
