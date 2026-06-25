import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { name, city, state, email } = await req.json()
  if (!name?.trim() || !city?.trim() || !state?.trim()) {
    return NextResponse.json({ error: 'Name, city, and state are required' }, { status: 400 })
  }
  const trimmedEmail = typeof email === 'string' ? email.trim() : ''
  if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return NextResponse.json({ error: 'Enter a valid hub contact email or leave it blank.' }, { status: 400 })
  }

  const hub = await prisma.hub.update({
    where: { id },
    data: { name: name.trim(), city: city.trim(), state: state.trim().toUpperCase() },
  })
  // M6: persist the email via raw SQL (column newer than the generated client).
  await prisma.$executeRaw`UPDATE "hubs" SET "email" = ${trimmedEmail || null} WHERE "id" = ${id}`
  return NextResponse.json({ ...hub, email: trimmedEmail || null })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  // Soft-delete: mark inactive rather than hard delete
  await prisma.hub.update({ where: { id }, data: { isActive: false } })
  return new NextResponse(null, { status: 204 })
}
