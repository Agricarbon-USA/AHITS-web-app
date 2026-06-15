import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

const schema = z.object({ note: z.string().min(1, 'Note is required') })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const rig = await prisma.rig.findUnique({
    where: { id },
    include: {
      kits: { include: { items: { where: { removedAt: null } } } },
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
  if (!parsed.success) return NextResponse.json({ error: 'Note is required' }, { status: 400 })

  const { note } = parsed.data
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.rig.update({ where: { id }, data: { endedAt: now, notes: note } })

    for (const kit of rig.kits) {
      const itemIds = kit.items.map((ki) => ki.inventoryItemId)
      if (itemIds.length > 0) {
        await tx.checkLog.createMany({
          data: itemIds.map((itemId) => ({
            action: 'CHECK_IN' as const,
            itemId,
            operatorId: rig.operatorId,
            notes: note,
          })),
        })
        await tx.inventoryItem.updateMany({
          where: { id: { in: itemIds } },
          data: { status: 'AVAILABLE' },
        })
      }
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
