import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const category = await prisma.category.update({
    where: { id },
    data: { name: name.trim() },
  })
  return NextResponse.json(category)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  const inUse = await prisma.inventoryItem.count({ where: { categoryId: id } })
  if (inUse > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${inUse} item(s) still use this category` },
      { status: 409 },
    )
  }

  await prisma.category.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
