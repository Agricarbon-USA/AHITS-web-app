import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

const schema = z.object({
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
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params

  const item = await prisma.inventoryItem.findUnique({ where: { id } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (item.status !== 'INOPERABLE') {
    return NextResponse.json({ error: 'Item is not in INOPERABLE status' }, { status: 409 })
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { decision, note, repairType, shopName, shopAddress, dateDelivered, purchaseOrder, invoiceNumber, repairHubId } = parsed.data

  if (decision === 'RETIRE') {
    await prisma.inventoryItem.update({ where: { id }, data: { status: 'RETIRED' } })
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({ where: { id }, data: { status: 'IN_MAINTENANCE' } })
      await tx.maintenanceTask.create({
        data: {
          itemId: id,
          taskName: `Admin repair decision: ${item.name}`,
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
