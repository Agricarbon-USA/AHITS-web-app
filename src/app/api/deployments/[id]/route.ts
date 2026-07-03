import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireAdmin } from '@/lib/auth/session'
import { getDeploymentRoster, addProjectLink, removeAllProjectLinks } from '@/lib/deployment-assignments'

const RIG_INCLUDE = {
  operator: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  vehicles: {
    where: { removedAt: null },
    include: { vehicle: { select: { id: true, name: true, type: true, isRental: true, rentalAgreementUrl: true } } },
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
              itemType: true,
              categoryRef: { select: { name: true } },
            },
          },
          inventoryUnit: {
            select: { id: true, qrCodeId: true, serialNumber: true, status: true },
          },
        },
      },
    },
  },
  secondaryOperators: {
    include: { operator: { select: { id: true, name: true, email: true } } },
  },
} as const

// Trimmed include for GET — operator/project/secondaryOperators sourced from roster helpers
const RIG_GET_INCLUDE = {
  vehicles: {
    where: { removedAt: null },
    include: { vehicle: { select: { id: true, name: true, type: true, isRental: true, rentalAgreementUrl: true } } },
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
              itemType: true,
              categoryRef: { select: { name: true } },
            },
          },
          inventoryUnit: {
            select: { id: true, qrCodeId: true, serialNumber: true, status: true },
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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const rig = await prisma.rig.findUnique({ where: { id }, include: RIG_GET_INCLUDE })
  if (!rig) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.role !== 'ADMIN' && rig.operatorId !== session.userId) {
    const isSecondary = await prisma.rigOperator.findUnique({
      where: { rigId_operatorId: { rigId: id, operatorId: session.userId } },
    })
    if (!isSecondary) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ro = await getDeploymentRoster(id)
  // The roster only returns OPEN assignments, so ENDED deployments have operator:null.
  // Hydrate from the retained legacy Rig.operatorId (schema NOT NULL; users are
  // soft-deleted, never removed) so historical attribution still displays and the admin
  // drawer/list can't crash on a null operator after a deployment is ended. Mirrors the
  // list route's fallback (completes B1 for the single-rig GET; pairs with UR-032).
  let operator = ro.operator ? { id: ro.operator.id, name: ro.operator.name } : null
  if (!operator) {
    const fallback = await prisma.user.findUnique({
      where: { id: rig.operatorId },
      select: { id: true, name: true },
    })
    operator = fallback ?? { id: rig.operatorId, name: 'Unknown operator' }
  }
  return NextResponse.json({
    ...rig,
    operatorId: ro.operatorId ?? rig.operatorId,
    operator,
    project: ro.projects[0] ?? null,
    secondaryOperators: ro.secondaryOperators,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const rig = await prisma.rig.findUnique({ where: { id } })
  if (!rig) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.role !== 'ADMIN' && rig.operatorId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.rig.update({ where: { id }, data: parsed.data, include: RIG_INCLUDE })
    if (parsed.data.projectId !== undefined) {
      await removeAllProjectLinks(id, tx)
      if (parsed.data.projectId) await addProjectLink(id, parsed.data.projectId, tx)
    }
    return result
  })
  return NextResponse.json(updated)
}
