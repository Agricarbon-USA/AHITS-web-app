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
  note: z.string().min(1, 'Note is required'),
})

const vehicleDispositionSchema = z.object({
  vehicleId: z.string(),
  dispositionType: z.enum(['AVAILABLE', 'IN_MAINTENANCE', 'RETIRED', 'TRANSFER']),
  toOperatorId: z.string().optional(), // for TRANSFER
  note: z.string().optional(),
})

const removeSchema = z.object({
  vehicles: z.array(vehicleDispositionSchema).min(1),
  note: z.string().min(1, 'Note is required'),
})

async function getAuthorizedActiveRig(id: string, session: { userId: string; role: string }) {
  const rig = await prisma.rig.findUnique({ where: { id } })
  if (!rig || rig.endedAt) return null
  if (session.role === 'ADMIN') return rig
  if (rig.operatorId === session.userId) return rig
  const secondary = await prisma.rigOperator.findUnique({
    where: { rigId_operatorId: { rigId: id, operatorId: session.userId } },
  })
  if (secondary) return rig
  return null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const rig = await getAuthorizedActiveRig(id, session)
  if (!rig) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const parsed = addSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { vehicleIds, note } = parsed.data

  // Verify vehicles exist and aren't already in another active rig
  const vehicles = await prisma.vehicle.findMany({
    where: { id: { in: vehicleIds } },
  })
  if (vehicles.length !== vehicleIds.length) {
    return NextResponse.json({ error: 'One or more vehicles not found' }, { status: 404 })
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.rigVehicle.createMany({
        data: vehicleIds.map((vehicleId) => ({
          rigId: id,
          vehicleId,
          addNote: note,
        })),
        skipDuplicates: true,
      })
      await tx.vehicle.updateMany({
        where: { id: { in: vehicleIds } },
        data: { assignedOperatorId: rig.operatorId },
      })
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to add vehicles'
    console.error('[POST /api/deployments/[id]/vehicles]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const updated = await prisma.rig.findUniqueOrThrow({ where: { id }, include: RIG_INCLUDE })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const rig = await getAuthorizedActiveRig(id, session)
  if (!rig) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const parsed = removeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { vehicles, note } = parsed.data
  const now = new Date()

  try {
    await prisma.$transaction(async (tx) => {
      for (const disp of vehicles) {
        // Mark the RigVehicle as removed
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

        if (disp.dispositionType === 'TRANSFER' && disp.toOperatorId) {
          // Create a transfer request for the vehicle
          await tx.transferRequest.create({
            data: {
              fromRigId: id,
              toOperatorId: disp.toOperatorId,
              initiatedById: session.userId,
              note,
              status: 'PENDING',
              vehicles: { create: [{ vehicleId: disp.vehicleId }] },
            },
          })
          // Don't clear assignedOperatorId yet — happens on acceptance
        } else {
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
  return NextResponse.json(updated)
}
