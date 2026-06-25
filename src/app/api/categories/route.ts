import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireAdmin } from '@/lib/auth/session'

export async function GET() {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json(categories)
}

export async function POST(req: Request) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const existing = await prisma.category.findFirst({ where: { name: { equals: name.trim(), mode: 'insensitive' } } })
  if (existing) return NextResponse.json({ error: 'Category already exists' }, { status: 409 })

  const maxOrder = await prisma.category.aggregate({ _max: { sortOrder: true } })
  const category = await prisma.category.create({
    data: { name: name.trim(), sortOrder: (maxOrder._max.sortOrder ?? 0) + 1 },
  })
  return NextResponse.json(category, { status: 201 })
}
