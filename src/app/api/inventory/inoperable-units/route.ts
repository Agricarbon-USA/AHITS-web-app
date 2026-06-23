import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'

// Serialized units currently flagged INOPERABLE and awaiting an admin review
// (repair-or-retire). Surfaced on the Maintenance screen so the decision lives
// where the admin already works, not four clicks deep in inventory (UX-13).
export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const units = await prisma.inventoryUnit.findMany({
    where: { status: 'INOPERABLE', deletedAt: null },
    orderBy: { inoperableReportedAt: 'desc' },
    select: {
      id: true,
      serialNumber: true,
      qrCodeId: true,
      inoperableNotes: true,
      inoperableReportedAt: true,
      inventoryItemId: true,
      inventoryItem: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({
    data: units.map((u) => ({
      id: u.id,
      itemId: u.inventoryItemId,
      itemName: u.inventoryItem.name,
      label: u.serialNumber ?? u.qrCodeId.slice(0, 8),
      inoperableNotes: u.inoperableNotes,
      reportedAt: u.inoperableReportedAt,
    })),
  })
}
