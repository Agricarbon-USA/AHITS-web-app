import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const alerts = await prisma.alert.findMany({
    where: { resolved: false },
    orderBy: { triggeredAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({ data: alerts })
}
