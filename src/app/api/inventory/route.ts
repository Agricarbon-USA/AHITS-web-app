import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import type { EquipmentCategory, EquipmentStatus } from '@prisma/client'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const page = parseInt(searchParams.get('page') ?? '1')
  const pageSize = parseInt(searchParams.get('pageSize') ?? '25')
  const status = searchParams.get('status') as EquipmentStatus | null
  const category = searchParams.get('category') as EquipmentCategory | null
  const q = searchParams.get('q')

  const where = {
    ...(status && { status }),
    ...(category && { category }),
    ...(q && { name: { contains: q, mode: 'insensitive' as const } }),
  }

  const [data, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { name: 'asc' },
      include: { _count: { select: { checkLogs: true } } },
    }),
    prisma.inventoryItem.count({ where }),
  ])

  return NextResponse.json({ data, total, page, pageSize })
}

const createSchema = z.object({
  name: z.string().min(1),
  category: z.string(),
  quantity: z.number().int().min(0).default(1),
  unitCost: z.number().optional(),
  supplier: z.string().optional(),
  reorderUrl: z.string().url().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  lowStockThreshold: z.number().int().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const item = await prisma.inventoryItem.create({ data: parsed.data as never })
  return NextResponse.json({ data: item }, { status: 201 })
}
