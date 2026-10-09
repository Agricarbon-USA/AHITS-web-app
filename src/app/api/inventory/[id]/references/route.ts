import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { openReferences } from '@/lib/asset-references'

// GET /api/inventory/[id]/references — PR-3c: what the Delete dialog says before the
// admin confirms. What still points at the item (the same reads Delete refuses on),
// what goes with it (its units by status, or its consumable stock), and the history
// that is kept but hidden.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const item = await prisma.inventoryItem.findFirst({ where: { id, deletedAt: null }, select: { id: true, itemType: true } })
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const [references, units, stock, kitRigs, checkLogs, repairs, photos] = await Promise.all([
    prisma.$transaction((tx) => openReferences({ itemId: id }, tx, { scope: 'delete' })),
    prisma.inventoryUnit.groupBy({ by: ['status'], where: { inventoryItemId: id, deletedAt: null }, _count: { _all: true } }),
    prisma.inventoryStock.findMany({ where: { itemId: id, quantity: { gt: 0 } }, select: { quantity: true } }),
    prisma.kitItem.findMany({ where: { inventoryItemId: id }, select: { kit: { select: { rigId: true } } } }),
    prisma.checkLog.count({ where: { itemId: id } }),
    prisma.maintenanceTask.count({ where: { isDamageReport: true, OR: [{ itemId: id }, { unit: { inventoryItemId: id } }] } }),
    prisma.photo.count({ where: { inventoryItemId: id } }),
  ])

  return NextResponse.json({
    data: {
      itemType: item.itemType,
      references,
      units: Object.fromEntries(units.map((u) => [u.status, u._count._all])),
      stock: { onHand: stock.reduce((n, s) => n + s.quantity, 0), hubs: stock.length },
      history: {
        deployments: new Set(kitRigs.map((k) => k.kit.rigId)).size,
        checkLogs,
        repairs,
        photos,
      },
    },
  })
}
