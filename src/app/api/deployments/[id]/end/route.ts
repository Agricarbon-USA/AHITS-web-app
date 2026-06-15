import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

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

const schema = z.object({
  note: z.string().min(1, 'Note is required'),
  itemDispositions: z.array(dispositionSchema).default([]),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const rig = await prisma.rig.findUnique({
    where: { id },
    include: {
      kits: {
        include: {
          items: {
            where: { removedAt: null },
            include: { item: { select: { id: true, name: true } } },
          },
        },
      },
      vehicles: { where: { removedAt: null } },
    },
  })
  if (!rig) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.role !== 'ADMIN' && rig.operatorId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (rig.endedAt) return NextResponse.json({ error: 'Deployment already ended' }, { status: 409 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { note, itemDispositions } = parsed.data
  const now = new Date()
  const allKitItems = rig.kits.flatMap((k) => k.items)

  await prisma.$transaction(async (tx) => {
    await tx.rig.update({ where: { id }, data: { endedAt: now, notes: note } })

    for (const disp of itemDispositions) {
      const kitItem = allKitItems.find((ki) => ki.id === disp.kitItemId)
      if (!kitItem) continue
      const inventoryItemId = kitItem.inventoryItemId

      await tx.kitItem.update({ where: { id: disp.kitItemId }, data: { removedAt: now } })

      if (disp.type === 'HUB') {
        await tx.checkLog.create({
          data: { action: 'CHECK_IN', itemId: inventoryItemId, operatorId: rig.operatorId, notes: note },
        })
        await tx.inventoryItem.update({
          where: { id: inventoryItemId },
          data: { status: 'AVAILABLE', hubId: disp.hubId ?? null },
        })
      } else if (disp.type === 'INOPERABLE') {
        await tx.checkLog.create({
          data: { action: 'CHECK_IN', itemId: inventoryItemId, operatorId: rig.operatorId, notes: note },
        })
        if (disp.canBeFixed) {
          await tx.inventoryItem.update({
            where: { id: inventoryItemId },
            data: {
              status: 'IN_MAINTENANCE',
              inoperableNotes: disp.inoperableNotes ?? null,
              inoperableReportedAt: now,
              inoperableReportedById: session.userId,
            },
          })
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
          await tx.inventoryItem.update({
            where: { id: inventoryItemId },
            data: {
              status: 'INOPERABLE',
              inoperableNotes: disp.inoperableNotes ?? null,
              inoperableReportedAt: now,
              inoperableReportedById: session.userId,
            },
          })
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
          note,
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
  })

  return NextResponse.json({ ok: true })
}
