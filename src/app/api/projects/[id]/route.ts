import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ProjectType, ProjectStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getDeploymentRostersForDisplay } from '@/lib/deployment-assignments'
import { requireAuth, requireAdmin } from '@/lib/auth/session'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      lead: { select: { id: true, name: true } },
      rigs: {
        orderBy: { startedAt: 'desc' },
      },
    },
  })
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // W0-10 PR-1: attach each rig's operator from the assignment roster, not Rig.operatorId.
  const projectRosters = await getDeploymentRostersForDisplay(project.rigs.map((r) => r.id))
  const projectOut = { ...project, rigs: project.rigs.map((r) => ({ ...r, operator: projectRosters.get(r.id)?.operator ?? null })) }
  return NextResponse.json({ data: projectOut })
}

// Whitelisted, mass-assignment-safe update. `.strict()` rejects unknown keys.
const updateSchema = z
  .object({
    name: z.string().min(1),
    type: z.nativeEnum(ProjectType),
    location: z.string().nullable(),
    startDate: z.coerce.date().nullable(),
    endDate: z.coerce.date().nullable(),
    status: z.nativeEnum(ProjectStatus),
    leadId: z.string().nullable(),
    notes: z.string().nullable(),
    customer: z.string().nullable(),
    code: z.string().nullable(),
    sizeHa: z.number().nonnegative().nullable(),
    sampleCount: z.number().int().nonnegative().nullable(),
  })
  .partial()
  .strict()

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const parsed = updateSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  try {
    const project = await prisma.project.update({ where: { id }, data: parsed.data })
    return NextResponse.json({ data: project })
  } catch {
    return NextResponse.json({ error: 'Project not found or update failed' }, { status: 404 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  // Block deletion while deployments reference this project, rather than
  // orphaning their history. The admin should reassign or end them first.
  const rigCount = await prisma.rig.count({ where: { projectId: id } })
  if (rigCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${rigCount} deployment${rigCount > 1 ? 's are' : ' is'} assigned to this project.` },
      { status: 409 },
    )
  }
  try {
    await prisma.project.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Project not found or delete failed' }, { status: 404 })
  }
}
