import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ProjectType, ProjectStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireAdmin } from '@/lib/auth/session'
import { listResponse } from '@/lib/validation'
import { countActiveDeploymentsForProjects } from '@/lib/project-associations'

export async function GET() {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projects = await prisma.project.findMany({
    orderBy: [{ name: 'asc' }, { id: 'asc' }], // L-13: stable tiebreaker
    include: {
      lead: { select: { id: true, name: true } },
    },
  })

  // PR-2 (C-12): active deployments via deployment_projects, not `_count.rigs`
  // over the legacy column (which counted ended rigs too).
  const active = await countActiveDeploymentsForProjects(projects.map((p) => p.id))
  const data = projects.map((p) => ({ ...p, activeDeployments: active.get(p.id) ?? 0 }))

  // Uncapped read — `total` is the row count, `truncated` false.
  return NextResponse.json(listResponse(data, data.length, { page: 1, pageSize: data.length || 1 }))
}

const createSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    type: z.nativeEnum(ProjectType).optional(),
    location: z.string().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    status: z.nativeEnum(ProjectStatus).optional(),
    leadId: z.string().optional(),
    notes: z.string().optional(),
    customer: z.string().optional(),
    code: z.string().optional(),
    sizeHa: z.number().nonnegative().optional(),
    sampleCount: z.number().int().nonnegative().optional(),
  })
  .strict()

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const project = await prisma.project.create({ data: parsed.data })
    return NextResponse.json({ data: project }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create project'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
