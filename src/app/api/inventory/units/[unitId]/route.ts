import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

const patchSchema = z.object({
  status: z.enum(['AVAILABLE', 'CHECKED_OUT', 'IN_MAINTENANCE', 'INOPERABLE', 'RETIRED']).optional(),
  serialNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ unitId: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { unitId } = await params

  const parsed = patchSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const unit = await prisma.inventoryUnit.update({
    where: { id: unitId },
    data: parsed.data,
    select: { id: true, qrCodeId: true, serialNumber: true, status: true, notes: true, createdAt: true, inventoryItemId: true },
  })

  if (parsed.data.status) {
    const action = parsed.data.status === 'CHECKED_OUT' ? 'CHECK_OUT' : 'CHECK_IN'
    await prisma.checkLog.create({
      data: {
        action,
        itemId: unit.inventoryItemId,
        inventoryUnitId: unitId,
        operatorId: session.userId,
        notes: `Admin status change → ${parsed.data.status}`,
      },
    })
  }

  return NextResponse.json({ data: unit })
}
