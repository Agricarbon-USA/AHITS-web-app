import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hubs = await prisma.hub.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(hubs)
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, city, state } = await req.json()
  if (!name?.trim() || !city?.trim() || !state?.trim()) {
    return NextResponse.json({ error: 'Name, city, and state are required' }, { status: 400 })
  }

  const hub = await prisma.hub.create({
    data: { name: name.trim(), city: city.trim(), state: state.trim().toUpperCase() },
  })
  return NextResponse.json(hub, { status: 201 })
}
