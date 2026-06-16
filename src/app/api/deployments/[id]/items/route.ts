import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

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
              category: { select: { name: true } },
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
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
          const unit = await tx.inventoryUnit.findUnique({ where: { id: entry.inventoryUnitId } })
          if (!unit || unit.inventoryItemId !== entry.inventoryItemId || unit.status !== 'AVAILABLE') {
            throw new Error(`Unit ${entry.inventoryUnitId} is not available`)
          }
          await tx.inventoryUnit.update({
            where: { id: entry.inventoryUnitId },
            data: { status: 'CHECKED_OUT' },
          })
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
              operatorId: rig.operatorId,
              projectId: rig.projectId ?? undefined,
              notes: note,
            },
          })
        } else {
          const availableUnits = await tx.inventoryUnit.findMany({
            where: { inventoryItemId: entry.inventoryItemId, status: 'AVAILABLE' },
            take: entry.quantity,
          })
          if (availableUnits.length < entry.quantity) {
            throw new Error(`Only ${availableUnits.length} units available for this item`)
          }
          await tx.inventoryUnit.updateMany({
            where: { id: { in: availableUnits.map((u) => u.id) } },
            data: { status: 'CHECKED_OUT' },
          })
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
              operatorId: rig.operatorId,
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
            context: 'MAINTENANCE' as const,
            uploadedById: session.userId,
          })),
        })
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Checkout failed'
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  const updated = await prisma.rig.findUniqueOrThrow({ where: { id }, include: RIG_INCLUDE })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
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

  await prisma.$transaction(async (tx) => {
    for (const disp of itemDispositions) {
      const kitItem = kitItems.find((ki) => ki.id === disp.kitItemId)
      if (!kitItem) continue
      const inventoryItemId = kitItem.inventoryItemId

      await tx.kitItem.update({ where: { id: disp.kitItemId }, data: { removedAt: now } })

      if (disp.type === 'HUB') {
        await tx.checkLog.create({
          data: {
            action: 'CHECK_IN',
            itemId: inventoryItemId,
            inventoryUnitId: kitItem.inventoryUnitId ?? undefined,
            operatorId: rig.operatorId,
            notes: note,
          },
        })

        if (kitItem.inventoryUnit) {
          await tx.inventoryUnit.update({
            where: { id: kitItem.inventoryUnit.id },
            data: { status: 'AVAILABLE' },
          })
        } else {
          const units = await tx.inventoryUnit.findMany({
            where: { inventoryItemId, status: 'CHECKED_OUT' },
            take: kitItem.quantity,
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
        await tx.checkLog.create({
          data: {
            action: 'CHECK_IN',
            itemId: inventoryItemId,
            inventoryUnitId: kitItem.inventoryUnitId ?? undefined,
            operatorId: rig.operatorId,
            notes: note,
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
          items: { create: disps.map((d) => ({ kitItemId: d.kitItemId })) },
        },
      })
    }
  })

  const updated = await prisma.rig.findUniqueOrThrow({ where: { id }, include: RIG_INCLUDE })
  return NextResponse.json(updated)
}
