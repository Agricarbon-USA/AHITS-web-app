import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { getDeploymentRoster, getActivePrimaryForRig, ensureOpenAssignment, endAssignmentByRole } from '@/lib/deployment-assignments'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const rig = await prisma.rig.findUnique({ where: { id } })
  if (!rig) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const ro = await getDeploymentRoster(id)
  return NextResponse.json({ ...rig, operator: ro.operator, secondaryOperators: ro.secondaryOperators })
}

const addSchema = z.object({ operatorId: z.string() })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const parsed = addSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { operatorId } = parsed.data

  const rig = await prisma.rig.findUnique({ where: { id }, select: { operatorId: true } })
  if (!rig) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const primaryId = (await getActivePrimaryForRig(id)) ?? rig.operatorId
  if (primaryId === operatorId) {
    return NextResponse.json({ error: 'Operator is already the primary operator' }, { status: 409 })
  }

  const assignment = await prisma.$transaction(async (tx) => {
    const result = await tx.rigOperator.upsert({
      where: { rigId_operatorId: { rigId: id, operatorId } },
      create: { rigId: id, operatorId },
      update: {},
      include: { operator: { select: { id: true, name: true, email: true } } },
    })
    await ensureOpenAssignment({ rigId: id, operatorId, role: 'SECONDARY', addedById: session.userId }, tx)
    return result
  })
  return NextResponse.json(assignment, { status: 201 })
}

const removeSchema = z.object({ operatorId: z.string() })

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const parsed = removeSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  await prisma.$transaction(async (tx) => {
    await tx.rigOperator.deleteMany({ where: { rigId: id, operatorId: parsed.data.operatorId } })
    await endAssignmentByRole(id, parsed.data.operatorId, 'SECONDARY', tx)
  })
  return NextResponse.json({ ok: true })
}
