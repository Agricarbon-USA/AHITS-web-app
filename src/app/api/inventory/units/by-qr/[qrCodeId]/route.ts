import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { categoryDisplay } from '@/lib/inventory'
import { parseScannedCode } from '@/lib/qr'
import { PICKABLE_STATUSES } from '@/lib/populations'
import type { EquipmentStatus } from '@prisma/client'

// GET /api/inventory/units/by-qr/[qrCodeId]
// Resolve a scanned QR payload to an InventoryUnit + its parent item.
// QR labels encode the unit's `qrCodeId` directly (see admin downloadUnitQR),
// but we also tolerate a full URL/path payload by using its last segment.
// This endpoint was referenced by the operator Scan and My-Rig screens but
// never existed, so every scan returned 404 ("QR code not recognised").
export async function GET(_req: NextRequest, { params }: { params: Promise<{ qrCodeId: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { qrCodeId } = await params
  const key = parseScannedCode(decodeURIComponent(qrCodeId))

  // PR-3c (D-r): deleted units are found too — a sticker of deleted gear must say so.
  const unit = await prisma.inventoryUnit.findFirst({
    where: { qrCodeId: key },
    select: {
      id: true,
      qrCodeId: true,
      serialNumber: true,
      status: true,
      notes: true,
      deletedAt: true,
      inventoryItemId: true,
      inventoryItem: {
        select: {
          id: true,
          name: true,
          deletedAt: true,
          itemType: true,
          category: true,
          categoryRef: { select: { id: true, name: true } },
        },
      },
    },
  })

  if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })

  // PR-3c (D-r): 410 with what it was and how to get it back — never a generic "not
  // found". The label is its serial, else its position among the units deleted with
  // it (the live-sibling math would give a deleted unit position 0).
  const deletedAt = unit.deletedAt ?? unit.inventoryItem.deletedAt
  if (deletedAt) {
    let label = unit.serialNumber ? `serial ${unit.serialNumber}` : null
    if (!label) {
      const sameStamp = await prisma.inventoryUnit.findMany({
        where: { inventoryItemId: unit.inventoryItemId, deletedAt: unit.deletedAt ? deletedAt : null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      })
      label = `unit ${sameStamp.findIndex((s) => s.id === unit.id) + 1}`
    }
    return NextResponse.json(
      { error: `${unit.inventoryItem.name} (${label}) was deleted from inventory — an admin can restore it under Show deleted.` },
      { status: 410 },
    )
  }

  // 1-based position among this item's units (createdAt order) — a label
  // fallback for units without a serial number.
  const siblings = await prisma.inventoryUnit.findMany({
    where: { inventoryItemId: unit.inventoryItemId, deletedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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
      // PR-3a (D-n): whether a checkout would accept this unit — the scan page's "Add"
      // reads this instead of re-spelling the pickable statuses on the client.
      pickable: (PICKABLE_STATUSES as readonly EquipmentStatus[]).includes(unit.status),
    },
    item: {
      id: unit.inventoryItem.id,
      name: unit.inventoryItem.name,
      itemType: unit.inventoryItem.itemType,
      category: categoryDisplay(unit.inventoryItem),
    },
  })
}
