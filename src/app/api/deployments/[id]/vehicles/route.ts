import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hydrateRigOperator } from '@/lib/deployment-assignments'
import { getAuthorizedActiveRig } from '@/lib/deployment-auth'
import { requireAuth } from '@/lib/auth/session'
import { withIdempotency } from '@/lib/idempotency'

const RIG_INCLUDE = {
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
} as const

const addSchema = z.object({
  vehicleIds: z.array(z.string()).min(1),
  note: z.string().optional(), // CC-24: optional (was min(1)) — also fixes a latent 400 when the client sent an empty note
})

const vehicleDispositionSchema = z.object({
  vehicleId: z.string(),
  dispositionType: z.enum(['AVAILABLE', 'IN_MAINTENANCE', 'RETIRED', 'TRANSFER']),
  toOperatorId: z.string().optional(), // for TRANSFER
  note: z.string().optional(),
})

const removeSchema = z.object({
  vehicles: z.array(vehicleDispositionSchema).min(1),
  note: z.string().optional(), // CC-24: optional (was min(1)) — also fixes a latent 400 when the client sent an empty note
})


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const rig = await getAuthorizedActiveRig(id, session)
  if (!rig) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const parsed = addSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { vehicleIds, note } = parsed.data

  // Verify vehicles exist
  const vehicles = await prisma.vehicle.findMany({
    where: { id: { in: vehicleIds }, deletedAt: null },
  })
  if (vehicles.length !== vehicleIds.length) {
    return NextResponse.json({ error: 'One or more vehicles not found' }, { status: 404 })
  }

  // Reject vehicles already held by a different active deployment (open RigVehicle).
  // Without this, adding such a vehicle silently reassigns it and leaves it in two rigs.
  const vehicleConflicts = await prisma.rigVehicle.findMany({
    where: {
      vehicleId: { in: vehicleIds },
      removedAt: null,
      rigId: { not: id },
      rig: { endedAt: null },
    },
    include: { vehicle: { select: { name: true } } },
  })
  if (vehicleConflicts.length > 0) {
    const names = [...new Set(vehicleConflicts.map((c) => c.vehicle.name))].join(', ')
    return NextResponse.json(
      { error: `Already assigned to another active deployment: ${names}. Remove it there first.` },
      { status: 409 }
    )
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.rigVehicle.createMany({
        data: vehicleIds.map((vehicleId) => ({
          rigId: id,
          vehicleId,
          addNote: note ?? '',
        })),
        skipDuplicates: true,
      })
      await tx.vehicle.updateMany({
        where: { id: { in: vehicleIds } },
        data: { assignedOperatorId: rig.operatorId },
      })
    })
  } catch (err: unknown) {
    // W0-10 PR-2b: a partial-unique violation (index C, one open RigVehicle per vehicle,
    // or the concurrent-add race the pre-check can slip) surfaces as Prisma P2002 / PG
    // 23505 — translate to a friendly 409 instead of a raw 500.
    const code = (err as { code?: string }).code
    if (code === 'P2002' || code === '23505') {
      return NextResponse.json(
        { error: 'One or more of those vehicles is already on an active deployment. Remove it there first.' },
        { status: 409 }
      )
    }
    const msg = err instanceof Error ? err.message : 'Failed to add vehicles'
    console.error('[POST /api/deployments/[id]/vehicles]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const updated = await prisma.rig.findUniqueOrThrow({ where: { id }, include: RIG_INCLUDE })
  return NextResponse.json(await hydrateRigOperator(updated))
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withIdempotency(req, 'deployments.vehicles.DELETE', () => _DELETE(req, ctx))
}

async function _DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const rig = await getAuthorizedActiveRig(id, session)
  if (!rig) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const parsed = removeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { vehicles, note } = parsed.data

  for (const disp of vehicles) {
    if (disp.dispositionType === 'TRANSFER' && !disp.toOperatorId) {
      return NextResponse.json(
        { error: 'toOperatorId is required when dispositionType is TRANSFER' },
        { status: 400 }
      )
    }
  }

  const now = new Date()

  try {
    await prisma.$transaction(async (tx) => {
      for (const disp of vehicles) {
        if (disp.dispositionType === 'TRANSFER' && disp.toOperatorId) {
          // Keep the RigVehicle row open (removedAt: null) so the accept path's
          // "still present" guard can find it. The row is closed when accepted.
          await tx.transferRequest.create({
            data: {
              fromRigId: id,
              toOperatorId: disp.toOperatorId,
              initiatedById: session.userId,
              note: note ?? '',
              status: 'PENDING',
              vehicles: { create: [{ vehicleId: disp.vehicleId }] },
            },
          })
          // Don't clear assignedOperatorId yet — happens on acceptance
        } else {
          // Mark the RigVehicle as removed for all non-TRANSFER dispositions
          await tx.rigVehicle.updateMany({
            where: {
              rigId: id,
              vehicleId: disp.vehicleId,
              removedAt: null,
            },
            data: {
              removedAt: now,
              removeNote: disp.note ?? note,
            },
          })
          // Update vehicle status and clear assignment
          const statusMap: Record<string, 'ACTIVE' | 'IN_MAINTENANCE' | 'RETIRED'> = {
            AVAILABLE: 'ACTIVE',
            IN_MAINTENANCE: 'IN_MAINTENANCE',
            RETIRED: 'RETIRED',
          }
          await tx.vehicle.update({
            where: { id: disp.vehicleId },
            data: {
              status: statusMap[disp.dispositionType] ?? 'ACTIVE',
              assignedOperatorId: null,
            },
          })
        }
      }
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to remove vehicles'
    console.error('[DELETE /api/deployments/[id]/vehicles]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const updated = await prisma.rig.findUniqueOrThrow({ where: { id }, include: RIG_INCLUDE })
  return NextResponse.json(await hydrateRigOperator(updated))
}
