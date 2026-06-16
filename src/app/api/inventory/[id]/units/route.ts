import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

const addSchema = z.object({
  count: z.number().int().min(1).default(1),
  serialNumbers: z.array(z.string()).optional(),
})

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const units = await prisma.inventoryUnit.findMany({
    where: { inventoryItemId: id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, qrCodeId: true, serialNumber: true, status: true, notes: true, createdAt: true },
  })
  const withPosition = units.map((u, i) => ({ ...u, position: i + 1 }))
  return NextResponse.json({ data: withPosition })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const item = await prisma.inventoryItem.findUnique({ where: { id } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = addSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { count, serialNumbers } = parsed.data

  const units = await prisma.$transaction(async (tx) => {
    const created = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        tx.inventoryUnit.create({
          data: {
            inventoryItemId: id,
            serialNumber: serialNumbers?.[i] ?? null,
          },
          select: { id: true, qrCodeId: true, serialNumber: true, status: true, notes: true, createdAt: true },
        })
      )
    )
    await tx.inventoryItem.update({ where: { id }, data: { quantity: { increment: count } } })
    return created
  })

  return NextResponse.json({ data: units }, { status: 201 })
}
