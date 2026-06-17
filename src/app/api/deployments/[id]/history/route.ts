import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const logs = await prisma.checkLog.findMany({
    where: { rigId: id },
    orderBy: { submittedAt: 'desc' },
    include: {
      operator: { select: { id: true, name: true } },
      item: { select: { id: true, name: true } },
      inventoryUnit: { select: { id: true, serialNumber: true, qrCodeId: true } },
    },
  })
  return NextResponse.json({ data: logs })
}
