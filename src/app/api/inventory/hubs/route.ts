import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await prisma.hub.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ data })
}
