import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

export async function GET(_: NextRequest, { params }: { params: Promise<{ qrCodeId: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { qrCodeId } = await params

  const unit = await prisma.inventoryUnit.findUnique({
    where: { qrCodeId },
    include: {
      inventoryItem: {
        select: { id: true, name: true, itemType: true, category: { select: { name: true } } },
      },
    },
  })
  if (!unit) return NextResponse.json({ error: 'QR code not recognised' }, { status: 404 })

  const siblings = await prisma.inventoryUnit.findMany({
    where: { inventoryItemId: unit.inventoryItemId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  const position = siblings.findIndex((s) => s.id === unit.id) + 1

  return NextResponse.json({ unit: { ...unit, position }, item: unit.inventoryItem })
}
