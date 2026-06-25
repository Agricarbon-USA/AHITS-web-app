import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ProjectType, ProjectStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireAdmin } from '@/lib/auth/session'

export async function GET() {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projects = await prisma.project.findMany({
    orderBy: { name: 'asc' },
    include: {
      lead: { select: { id: true, name: true } },
      // Active deployments = rigs on this project that haven't ended.
      _count: { select: { rigs: true } },
    },
  })

  return NextResponse.json({ data: projects })
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
