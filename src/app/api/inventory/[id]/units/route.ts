import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { computeUnitCounts, withPositions } from '@/lib/inventory'

const bodySchema = z.object({
  count: z.number().int().min(1).max(200).default(1),
  // Optional serials, applied positionally to the newly created units.
  serialNumbers: z.array(z.string().min(1)).optional(),
  // QR association-on-create (PRD §7.7): existing physical label codes, applied
  // positionally to the new units. Omit an entry to auto-generate that unit's id.
  qrCodeIds: z.array(z.string().trim().min(1)).optional(),
})

// POST /api/inventory/[id]/units
// Create one or more InventoryUnit rows for a serialized item. This is the
// endpoint behind the admin "Add Unit" button (previously missing → silent 404).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { count, serialNumbers, qrCodeIds } = parsed.data

  try {
    const item = await prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    })
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    await prisma.inventoryUnit.createMany({
      data: Array.from({ length: count }, (_, i) => {
        const qr = qrCodeIds?.[i]?.trim()
        return {
          inventoryItemId: id,
          serialNumber: serialNumbers?.[i]?.trim() || null,
          // Only set qrCodeId when a label code was supplied; otherwise let the
          // schema default generate one.
          ...(qr ? { qrCodeId: qr } : {}),
        }
      }),
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
    // Duplicate QR label code.
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'That QR label code is already assigned to another unit.' },
        { status: 409 },
      )
    }
    const msg = err instanceof Error ? err.message : 'Failed to add units'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
