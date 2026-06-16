import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

function computeUnitCounts(units: { status: string }[]) {
  return {
    totalUnits: units.length,
    available:     units.filter((u) => u.status === 'AVAILABLE').length,
    checkedOut:    units.filter((u) => u.status === 'CHECKED_OUT').length,
    inMaintenance: units.filter((u) => u.status === 'IN_MAINTENANCE').length,
    inoperable:    units.filter((u) => u.status === 'INOPERABLE').length,
    retired:       units.filter((u) => u.status === 'RETIRED').length,
  }
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: {
      category: true,
      hub: true,
      checkLogs: { include: { operator: true }, orderBy: { submittedAt: 'desc' }, take: 20 },
      photos: true,
      units: {
        select: {
          id: true,
          qrCodeId: true,
          serialNumber: true,
          status: true,
          notes: true,
          inoperableNotes: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    data: {
      ...item,
      unitCounts: computeUnitCounts(item.units),
    },
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json()

  // Strip fields that no longer exist on InventoryItem (moved to InventoryUnit)
  const { status: _s, inoperableNotes: _a, inoperableReportedAt: _b, inoperableReportedById: _c, ...safeData } = body

  const item = await prisma.inventoryItem.update({ where: { id }, data: safeData })
  return NextResponse.json({ data: item })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  await prisma.inventoryItem.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
