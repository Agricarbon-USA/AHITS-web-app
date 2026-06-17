import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

const ENUM_LABELS: Record<string, string> = {
  SAMPLING_EQUIPMENT: 'Sampling Equipment',
  POWER_TOOLS: 'Power Tools',
  HAND_TOOLS: 'Hand Tools',
  SAFETY_GEAR: 'Safety Gear',
  ELECTRONICS_GPS: 'Electronics / GPS',
  STORAGE: 'Storage',
  OTHER: 'Other',
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: {
      categoryRef: { select: { id: true, name: true } },
      hub: { select: { id: true, name: true, city: true, state: true } },
      units: {
        where: { deletedAt: null },
        select: { id: true, qrCodeId: true, serialNumber: true, status: true, notes: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
      kitItems: {
        where: { removedAt: null },
        select: {
          kit: {
            select: {
              rig: {
                select: {
                  endedAt: true,
                  operator: { select: { id: true, name: true } },
                  project: { select: { id: true, name: true, location: true } },
                },
              },
            },
          },
        },
      },
      checkLogs: {
        select: {
          id: true, action: true, condition: true, submittedAt: true, inventoryUnitId: true,
          operator: { select: { id: true, name: true } },
        },
        orderBy: { submittedAt: 'desc' },
      },
      photos: true,
    },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const unitsByStatus = item.units.reduce<Record<string, number>>((acc, u) => {
    acc[u.status] = (acc[u.status] ?? 0) + 1
    return acc
  }, {})

  const unitCounts = {
    totalUnits: item.units.length,
    available: unitsByStatus['AVAILABLE'] ?? 0,
    checkedOut: unitsByStatus['CHECKED_OUT'] ?? 0,
    inMaintenance: unitsByStatus['IN_MAINTENANCE'] ?? 0,
    inoperable: unitsByStatus['INOPERABLE'] ?? 0,
    retired: unitsByStatus['RETIRED'] ?? 0,
  }

  const activeKit = item.kitItems.find((ki) => ki.kit.rig !== null && ki.kit.rig.endedAt === null)
  const activeRig = activeKit?.kit.rig ?? null

  const { kitItems, categoryRef, ...rest } = item

  return NextResponse.json({
    data: {
      ...rest,
      category: categoryRef ?? { id: item.category, name: ENUM_LABELS[item.category] ?? item.category },
      unitCounts,
      currentOperator: activeRig?.operator ?? null,
      currentProject: activeRig?.project ?? null,
    },
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json()
  const item = await prisma.inventoryItem.update({ where: { id }, data: body })
  return NextResponse.json({ data: item })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  await prisma.inventoryItem.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
