import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projects = await prisma.project.findMany({
    select: { id: true, name: true, status: true, location: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ data: projects })
}
