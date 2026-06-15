import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

const RIG_INCLUDE = {
  operator: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  vehicles: {
    where: { removedAt: null },
    include: { vehicle: { select: { id: true, name: true, type: true } } },
  },
  kits: {
    include: {
      items: {
        where: { removedAt: null },
        include: {
          item: {
            select: {
              id: true,
              name: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  },
} as const

const patchSchema = z.object({
  label: z.string().optional(),
  projectId: z.string().nullable().optional(),
  notes: z.string().optional(),
})

async function getAuthorizedRig(id: string, session: { userId: string; role: string }) {
  const rig = await prisma.rig.findUnique({ where: { id } })
  if (!rig) return null
  if (session.role !== 'ADMIN' && rig.operatorId !== session.userId) return null
  return rig
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const rig = await getAuthorizedRig(id, session)
  if (!rig) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const full = await prisma.rig.findUnique({ where: { id }, include: RIG_INCLUDE })
  return NextResponse.json(full)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const rig = await getAuthorizedRig(id, session)
  if (!rig) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const updated = await prisma.rig.update({ where: { id }, data: parsed.data, include: RIG_INCLUDE })
  return NextResponse.json(updated)
}
