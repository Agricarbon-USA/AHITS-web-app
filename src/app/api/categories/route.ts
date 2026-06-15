import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1).max(50),
  sortOrder: z.number().int().optional(),
})

export async function GET() {
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } })
  return NextResponse.json(categories)
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const maxOrder = await prisma.category.aggregate({ _max: { sortOrder: true } })
  const category = await prisma.category.create({
    data: {
      name: parsed.data.name,
      sortOrder: parsed.data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
    },
  })
  return NextResponse.json(category, { status: 201 })
}
