import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { writeOr404 } from '@/lib/api-errors'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  let category: Awaited<ReturnType<typeof prisma.category.update>> | undefined
  const notFound = await writeOr404(async () => {
    category = await prisma.category.update({ where: { id }, data: { name: name.trim() } })
  }, 'Category not found')
  if (notFound) return notFound
  return NextResponse.json(category!)
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

  const notFound = await writeOr404(() => prisma.category.delete({ where: { id } }), 'Category not found')
  if (notFound) return notFound
  return new NextResponse(null, { status: 204 })
}
