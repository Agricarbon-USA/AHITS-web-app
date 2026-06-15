import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { z } from 'zod'

const schema = z.object({ name: z.string().min(1).max(50) })

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const category = await prisma.category.update({
    where: { id },
    data: { name: parsed.data.name },
  })
  return NextResponse.json(category)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const count = await prisma.inventoryItem.count({ where: { categoryId: id } })
  if (count > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${count} item(s) still use this category. Reassign them first.` },
      { status: 409 }
    )
  }
  await prisma.category.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
