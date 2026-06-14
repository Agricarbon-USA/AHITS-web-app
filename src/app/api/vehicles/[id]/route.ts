import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      dailyChecks: { orderBy: { date: 'desc' }, take: 10, include: { operator: true } },
      maintenanceTasks: { orderBy: { nextDue: 'asc' } },
      photos: { orderBy: { takenAt: 'desc' }, take: 6 },
    },
  })
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data: vehicle })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json()
  const vehicle = await prisma.vehicle.update({ where: { id }, data: body })
  return NextResponse.json({ data: vehicle })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  await prisma.vehicle.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
