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
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  },
} as const

const addSchema = z.object({
  items: z.array(z.object({
    inventoryItemId: z.string(),
    quantity: z.number().int().min(1),
  })).min(1),
  note: z.string().min(1, 'Note is required'),
  photoUrls: z.array(z.string()).default([]),
})

const removeSchema = z.object({
  kitItemIds: z.array(z.string()).min(1),
  note: z.string().min(1, 'Note is required'),
  photoUrls: z.array(z.string()).default([]),
})

async function getAuthorizedActiveRig(id: string, session: { userId: string; role: string }) {
  const rig = await prisma.rig.findUnique({ where: { id } })
  if (!rig || rig.endedAt) return null
  if (session.role !== 'ADMIN' && rig.operatorId !== session.userId) return null
  return rig
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

  await prisma.$transaction(async (tx) => {
    await tx.kitItem.createMany({
      data: items.map(({ inventoryItemId, quantity }) => ({
        kitId: kit.id,
        inventoryItemId,
        quantity,
      })),
    })

    const checkLogData = items.map(({ inventoryItemId }) => ({
      action: 'CHECK_OUT' as const,
      itemId: inventoryItemId,
      operatorId: rig.operatorId,
      projectId: rig.projectId ?? undefined,
      notes: note,
    }))
    await tx.checkLog.createMany({ data: checkLogData })

    await tx.inventoryItem.updateMany({
      where: { id: { in: items.map((i) => i.inventoryItemId) } },
      data: { status: 'CHECKED_OUT' },
    })
  })

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

  const { kitItemIds, note } = parsed.data
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    const kitItems = await tx.kitItem.findMany({
      where: { id: { in: kitItemIds }, removedAt: null },
    })
    await tx.kitItem.updateMany({
      where: { id: { in: kitItemIds } },
      data: { removedAt: now },
    })
    const inventoryItemIds = kitItems.map((ki) => ki.inventoryItemId)
    await tx.checkLog.createMany({
      data: inventoryItemIds.map((itemId) => ({
        action: 'CHECK_IN' as const,
        itemId,
        operatorId: rig.operatorId,
        notes: note,
      })),
    })
    await tx.inventoryItem.updateMany({
      where: { id: { in: inventoryItemIds } },
      data: { status: 'AVAILABLE' },
    })
  })

  const updated = await prisma.rig.findUniqueOrThrow({ where: { id }, include: RIG_INCLUDE })
  return NextResponse.json(updated)
}
