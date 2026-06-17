import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { categoryDisplay } from '@/lib/inventory'

// GET /api/inventory/units/by-qr/[qrCodeId]
// Resolve a scanned QR payload to an InventoryUnit + its parent item.
// QR labels encode the unit's `qrCodeId` directly (see admin downloadUnitQR),
// but we also tolerate a full URL/path payload by using its last segment.
// This endpoint was referenced by the operator Scan and My-Rig screens but
// never existed, so every scan returned 404 ("QR code not recognised").
export async function GET(_req: NextRequest, { params }: { params: Promise<{ qrCodeId: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { qrCodeId } = await params
  const raw = decodeURIComponent(qrCodeId)
  const key = raw.includes('/') ? (raw.split(/[/?#]/).filter(Boolean).pop() ?? raw) : raw

  const unit = await prisma.inventoryUnit.findFirst({
    where: { qrCodeId: key, deletedAt: null },
    select: {
      id: true,
      qrCodeId: true,
      serialNumber: true,
      status: true,
      notes: true,
      inventoryItemId: true,
      inventoryItem: {
        select: {
          id: true,
          name: true,
          itemType: true,
          category: true,
          categoryRef: { select: { id: true, name: true } },
        },
      },
    },
  })

  if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })

  // 1-based position among this item's units (createdAt order) — a label
  // fallback for units without a serial number.
  const siblings = await prisma.inventoryUnit.findMany({
    where: { inventoryItemId: unit.inventoryItemId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  const position = siblings.findIndex((s) => s.id === unit.id) + 1

  return NextResponse.json({
    unit: {
      id: unit.id,
      qrCodeId: unit.qrCodeId,
      serialNumber: unit.serialNumber,
      status: unit.status,
      notes: unit.notes,
      inventoryItemId: unit.inventoryItemId,
      position,
    },
    item: {
      id: unit.inventoryItem.id,
      name: unit.inventoryItem.name,
      itemType: unit.inventoryItem.itemType,
      category: categoryDisplay(unit.inventoryItem),
    },
  })
}
