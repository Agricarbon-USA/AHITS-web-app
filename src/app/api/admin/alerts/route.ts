import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const alerts = await prisma.alert.findMany({
    where: { resolved: false },
    orderBy: { triggeredAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({ data: alerts })
}
