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

const OPERATOR_ALLOWED_VEHICLE_TYPES = ['TRAILER', 'POLARIS_UTV', 'CAN_AM_UTV']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  // Operators can only edit trailers and UTVs; company trucks are admin-only
  if (session.role !== 'ADMIN') {
    const existing = await prisma.vehicle.findUnique({ where: { id }, select: { type: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!OPERATOR_ALLOWED_VEHICLE_TYPES.includes(existing.type as string)) {
      return NextResponse.json({ error: 'Operators may only edit trailers and UTVs' }, { status: 403 })
    }
  }

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
