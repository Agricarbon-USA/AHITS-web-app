import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1).max(100).optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().min(2).max(2).optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const hub = await prisma.hub.update({ where: { id }, data: parsed.data })
  return NextResponse.json(hub)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const count = await prisma.inventoryItem.count({ where: { hubId: id } })
  if (count > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${count} item(s) are assigned to this hub. Reassign them first.` },
      { status: 409 }
    )
  }
  await prisma.hub.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ ok: true })
}
