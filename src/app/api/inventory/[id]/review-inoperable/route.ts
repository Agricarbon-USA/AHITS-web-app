import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'

const schema = z.object({
  unitId: z.string(),
  decision: z.enum(['RETIRE', 'REPAIR']),
  note: z.string().min(1, 'Note is required'),
  repairType: z.enum(['IN_FIELD', 'AT_SHOP', 'SHIP_TO_HUB', 'SHIP_FOR_REPAIR']).optional(),
  shopName: z.string().optional(),
  shopAddress: z.string().optional(),
  dateDelivered: z.string().optional(),
  purchaseOrder: z.string().optional(),
  invoiceNumber: z.string().optional(),
  repairHubId: z.string().optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { unitId, decision, note, repairType, shopName, shopAddress, dateDelivered, purchaseOrder, invoiceNumber, repairHubId } = parsed.data

  const unit = await prisma.inventoryUnit.findUnique({ where: { id: unitId } })
  if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
  if (unit.inventoryItemId !== id) return NextResponse.json({ error: 'Unit does not belong to this item' }, { status: 400 })
  if (unit.status !== 'INOPERABLE') {
    return NextResponse.json({ error: 'Unit is not in INOPERABLE status' }, { status: 409 })
  }

  if (decision === 'RETIRE') {
    // Free the physical QR label for reuse on a replacement unit: the retired
    // row keeps its history but releases its unique code so the same label can
    // be re-registered (QR-reuse-on-retire). The `::retired::` suffix can't
    // collide with a real scanned code.
    await prisma.inventoryUnit.update({
      where: { id: unitId },
      data: { status: 'RETIRED', qrCodeId: `${unit.qrCodeId}::retired::${Date.now()}` },
    })
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.inventoryUnit.update({
        where: { id: unitId },
        data: { status: 'IN_MAINTENANCE' },
      })
      await tx.maintenanceTask.create({
        data: {
          itemId: id,
          taskName: `Admin repair decision: unit ${unit.serialNumber ?? unitId}`,
          isDamageReport: true,
          repairType: repairType ?? null,
          shopName: shopName ?? null,
          shopAddress: shopAddress ?? null,
          dateDelivered: dateDelivered ? new Date(dateDelivered) : null,
          purchaseOrder: purchaseOrder ?? null,
          invoiceNumber: invoiceNumber ?? null,
          repairHubId: repairHubId ?? null,
          status: 'IN_PROGRESS',
          notes: note,
        },
      })
    })
  }

  return NextResponse.json({ ok: true })
}
