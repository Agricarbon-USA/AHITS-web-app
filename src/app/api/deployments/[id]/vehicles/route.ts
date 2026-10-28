import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getActivePrimaryForRig, hydrateRigOperator } from '@/lib/deployment-assignments'
import { claimActiveRig, getAuthorizedActiveRig } from '@/lib/deployment-auth'
import { deploymentWriteConflict, transferRecipientProblem, waitingMessage, waitingTransfersForRig, WaitingConflict } from '@/lib/dispositions'
import { isUniqueViolationAnywhere } from '@/lib/api-errors'
import { requireAuth } from '@/lib/auth/session'
import { withIdempotency } from '@/lib/idempotency'
import { removeVehicleFromRig } from '@/lib/asset-status'
import { ReferenceConflict } from '@/lib/asset-references'
import { vehicleNotActiveMessage } from '@/lib/status'

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
  // PR-3b: only an Active vehicle can go on a deployment — not one in repair, out of
  // service or retired (the pickers offer Active only; this is the guard behind them).
  const notActive = vehicles.find((v) => v.status !== 'ACTIVE')
  if (notActive) {
    return NextResponse.json({ error: vehicleNotActiveMessage(notActive) }, { status: 409 })
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
  const activeElsewhere = (names: string) => `Already assigned to another active deployment: ${names}. Remove it there first.`
  if (vehicleConflicts.length > 0) {
    const names = [...new Set(vehicleConflicts.map((c) => c.vehicle.name))].join(', ')
    return NextResponse.json(
      { error: activeElsewhere(names) },
      { status: 409 }
    )
  }

  try {
    await prisma.$transaction(async (tx) => {
      // P1-1a (2.5): the deployment first.
      await claimActiveRig(tx, id)
      const created = await tx.rigVehicle.createMany({
        data: vehicleIds.map((vehicleId) => ({
          rigId: id,
          vehicleId,
          addNote: note ?? '',
        })),
        skipDuplicates: true,
      })
      // P1-1a (2.4): skipDuplicates also skips a vehicle another deployment just took (the
      // one-open-row index), so a short count is checked, not trusted. An id open here
      // already counts as added; any other id rolls the whole add back (409).
      const wanted = new Set(vehicleIds)
      let hereIds = vehicleIds
      if (created.count < wanted.size) {
        const open = await tx.rigVehicle.findMany({
          where: { vehicleId: { in: vehicleIds }, removedAt: null },
          select: { vehicleId: true, rigId: true, rig: { select: { endedAt: true } }, vehicle: { select: { name: true } } },
        })
        hereIds = open.filter((o) => o.rigId === id).map((o) => o.vehicleId)
        const missing = [...wanted].filter((vid) => !hereIds.includes(vid))
        if (missing.length > 0) {
          const elsewhere = open.filter((o) => missing.includes(o.vehicleId))
          const onEnded = [...new Set(elsewhere.filter((o) => o.rig.endedAt).map((o) => o.vehicle.name))]
          const onActive = [...new Set(elsewhere.filter((o) => !o.rig.endedAt).map((o) => o.vehicle.name))]
          if (onActive.length > 0) throw new ReferenceConflict(activeElsewhere(onActive.join(', ')))
          if (onEnded.length > 0) {
            throw new ReferenceConflict(`${onEnded.join(', ')} is waiting on transfer from an ended deployment — answer that transfer first.`)
          }
          throw new ReferenceConflict('One or more of those vehicles is already on an active deployment. Remove it there first.')
        }
      }
      await tx.vehicle.updateMany({
        where: { id: { in: hereIds } },
        data: { assignedOperatorId: rig.operatorId },
      })
    })
  } catch (err: unknown) {
    const conflict = deploymentWriteConflict(err)
    if (conflict) return NextResponse.json(conflict, { status: 409 })
    // W0-10 PR-2b: a partial-unique violation (index C, one open RigVehicle per vehicle,
    // or the concurrent-add race the pre-check can slip) — raw or ORM, P1-1a 2.4 —
    // translates to a friendly 409 instead of a raw 500.
    if (isUniqueViolationAnywhere(err)) {
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

  // P1-1a (2.7, §0-t): only an admin can retire a vehicle. Checked first.
  if (session.role !== 'ADMIN' && vehicles.some((d) => d.dispositionType === 'RETIRED')) {
    return NextResponse.json({ error: 'Only an admin can retire a vehicle.' }, { status: 403 })
  }

  const vehicleIds = [...new Set(vehicles.map((d) => d.vehicleId))]
  const names = new Map(
    (await prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, name: true } })).map((v) => [v.id, v.name]),
  )

  // P1-1a (2.2): every "Transfer to a person" names a real, active person who isn't the
  // deployment's own operator.
  const transferLines = vehicles
    .filter((d) => d.dispositionType === 'TRANSFER')
    .map((d) => ({ toOperatorId: d.toOperatorId, name: names.get(d.vehicleId) ?? null }))
  if (transferLines.length > 0) {
    const problem = await transferRecipientProblem(transferLines, await getActivePrimaryForRig(id))
    if (problem) return NextResponse.json({ error: problem.error }, { status: problem.status })
  }

  try {
    await prisma.$transaction(async (tx) => {
      // P1-1a (2.5): the deployment first.
      await claimActiveRig(tx, id)
      // 2.7: every vehicle named must be on this deployment.
      const here = new Set(
        (await tx.rigVehicle.findMany({ where: { rigId: id, vehicleId: { in: vehicleIds }, removedAt: null }, select: { vehicleId: true } }))
          .map((rv) => rv.vehicleId),
      )
      const gone = vehicleIds.find((vid) => !here.has(vid))
      if (gone) {
        const name = names.get(gone)
        throw new ReferenceConflict(name ? `${name} isn't on this deployment any more.` : "This vehicle isn't on this deployment any more.")
      }
      // 2.8 (§0-s): a vehicle waiting on a transfer stays with it — every disposition is refused.
      const waiting = await waitingTransfersForRig(id, tx)
      for (const vid of vehicleIds) {
        const w = waiting.vehicles.get(vid)
        if (w) throw new WaitingConflict(waitingMessage(names.get(vid) ?? 'This vehicle', w.toName))
      }
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
          // PR-3a (S-1): close the RigVehicle row through the status module. "Available"
          // no longer forces the vehicle ACTIVE — a vehicle with an open repair stays In
          // Maintenance, one an admin took out of service stays out. "Send to Maintenance"
          // opens (or joins) the vehicle's damage task and pulls it (CC-34 1c's task +
          // alert, now via openDamageTask); "Retired" retires it.
          await removeVehicleFromRig(tx, {
            rigId: id,
            vehicleId: disp.vehicleId,
            disposition: disp.dispositionType as 'AVAILABLE' | 'IN_MAINTENANCE' | 'RETIRED',
            note: disp.note ?? note ?? null,
            reportedById: session.userId,
          })
        }
      }
    })
  } catch (err: unknown) {
    // PR-3b: a "Retired" disposition on a vehicle something else still holds is refused.
    // P1-1a: so is a vehicle not on this deployment, one waiting on a transfer, or an ended deployment.
    const conflict = deploymentWriteConflict(err)
    if (conflict) return NextResponse.json(conflict, { status: 409 })
    const msg = err instanceof Error ? err.message : 'Failed to remove vehicles'
    console.error('[DELETE /api/deployments/[id]/vehicles]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const updated = await prisma.rig.findUniqueOrThrow({ where: { id }, include: RIG_INCLUDE })
  return NextResponse.json(await hydrateRigOperator(updated))
}
