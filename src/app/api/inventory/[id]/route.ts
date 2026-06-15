import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: {
      category: true,
      hub: true,
      checkLogs: { include: { operator: true }, orderBy: { submittedAt: 'desc' }, take: 10 },
      photos: true,
      inoperableReportedBy: { select: { id: true, name: true } },
    },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data: item })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json()
  const item = await prisma.inventoryItem.update({ where: { id }, data: body })
  return NextResponse.json({ data: item })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  await prisma.inventoryItem.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
