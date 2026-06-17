import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { computeUnitCounts, withPositions } from '@/lib/inventory'

const bodySchema = z.object({
  count: z.number().int().min(1).max(200).default(1),
  // Optional serials, applied positionally to the newly created units.
  serialNumbers: z.array(z.string().min(1)).optional(),
})

// POST /api/inventory/[id]/units
// Create one or more InventoryUnit rows for a serialized item. This is the
// endpoint behind the admin "Add Unit" button (previously missing → silent 404).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { count, serialNumbers } = parsed.data

  try {
    const item = await prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    })
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    await prisma.inventoryUnit.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        inventoryItemId: id,
        serialNumber: serialNumbers?.[i]?.trim() || null,
      })),
    })

    const units = await prisma.inventoryUnit.findMany({
      where: { inventoryItemId: id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, qrCodeId: true, serialNumber: true, status: true, notes: true, createdAt: true },
    })

    return NextResponse.json(
      { data: { units: withPositions(units), unitCounts: computeUnitCounts(units) } },
      { status: 201 },
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to add units'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
