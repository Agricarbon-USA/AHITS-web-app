import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { name, city, state } = await req.json()
  if (!name?.trim() || !city?.trim() || !state?.trim()) {
    return NextResponse.json({ error: 'Name, city, and state are required' }, { status: 400 })
  }

  const hub = await prisma.hub.update({
    where: { id },
    data: { name: name.trim(), city: city.trim(), state: state.trim().toUpperCase() },
  })
  return NextResponse.json(hub)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  // Soft-delete: mark inactive rather than hard delete
  await prisma.hub.update({ where: { id }, data: { isActive: false } })
  return new NextResponse(null, { status: 204 })
}
