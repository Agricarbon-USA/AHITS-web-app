import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { getDeploymentRostersForDisplay, ensureOpenAssignment, addProjectLink, getActiveRigForOperator, hydrateRigOperator } from '@/lib/deployment-assignments'
import { drawFromHub, getStockAtHub, totalStock, setStockAtHub, resyncItemTotal } from '@/lib/inventory-stock'
import { claimHeldStock } from '@/lib/deployment-requests'
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

// Trimmed include for GET list — operator/project/secondaryOperators sourced from roster helpers
const RIG_LIST_INCLUDE = {
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

const createSchema = z.object({
  operatorId: z.string().optional(),
  projectId: z.string().optional(),
  label: z.string().optional(),
  note: z.string().min(1, 'Note is required'),
  vehicleIds: z.array(z.string()).default([]),
  kitItems: z.array(z.union([
    z.object({
      inventoryItemId: z.string(),
      quantity: z.number().int().min(1),
      inventoryUnitId: z.undefined().optional(),
    }),
    z.object({
      inventoryItemId: z.string(),
      itemType: z.literal('SERIALIZED'),
      inventoryUnitId: z.string(),
    }),
  ])).default([]),
  sourceHubId: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const activeParam = searchParams.get('active')
  const active = activeParam === null || activeParam === 'true'
  const operatorIdParam = searchParams.get('operatorId')
  const projectId = searchParams.get('projectId')

  const operatorId = session.role === 'OPERATOR' ? session.userId : (operatorIdParam ?? undefined)

  // Resolve matching rigIds via deployment_projects so the filter reads the
  // authoritative M2M table, not the legacy Rig.projectId column.
  let projectRigIds: string[] | undefined
  if (projectId) {
    const rows = await prisma.$queryRaw<{ rigId: string }[]>`
      SELECT "rigId" FROM "deployment_projects"
      WHERE "projectId" = ${projectId} AND "removedAt" IS NULL
    `
    projectRigIds = rows.map((r) => r.rigId)
  }

  // W0-10 PR-1: rigs where this operator has an OPEN assignment (any role). Added to
  // the visibility OR below alongside the legacy primary/secondary clauses — non-revoking
  // (the two legacy clauses are removed at PR-4).
  let assignedRigIds: string[] = []
  if (session.role === 'OPERATOR') {
    const arows = await prisma.$queryRaw<{ rigId: string }[]>`
      SELECT DISTINCT "rigId" FROM "deployment_assignments"
      WHERE "operatorId" = ${session.userId} AND "endedAt" IS NULL`
    assignedRigIds = arows.map((r) => r.rigId)
  }

  const rigs = await prisma.rig.findMany({
    where: {
      ...(active ? { endedAt: null } : { endedAt: { not: null } }),
      ...(projectRigIds !== undefined && { id: { in: projectRigIds } }),
      // Operators see deployments where they are primary OR secondary
      ...(session.role === 'OPERATOR'
        ? { id: { in: assignedRigIds } }
        : operatorId ? { operatorId } : {}),
    },
    include: RIG_LIST_INCLUDE,
    orderBy: { startedAt: 'desc' },
  })

  // UR-032: display roster so ENDED deployments (active=false / history) keep
  // their operator attribution instead of serializing operator: null. Identical
  // to the open roster for active deployments.
  const rosters = await getDeploymentRostersForDisplay(rigs.map((r) => r.id))

  // W0-10 PR-4: the display roster is the sole source of operator attribution. It returns
  // the FINAL roster for ended deployments too (max_ended CTE), so historical attribution
  // still shows. A rig with no PRIMARY assignment (should be impossible under PR-2 index B +
  // the §6 Q1/Q2 drop gate) serializes operator:null rather than crashing.
  const out = rigs.map((r) => {
    const ro = rosters.get(r.id) ?? { operator: null, operatorId: null, secondaryOperators: [], projects: [] }
    const operator = ro.operator ? { id: ro.operator.id, name: ro.operator.name } : { id: 'unknown', name: 'Unknown operator' }
    return {
      ...r,
      operatorId: ro.operatorId ?? null,
      operator,
      project: ro.projects[0] ?? null,
      secondaryOperators: ro.secondaryOperators,
    }
  })
  return NextResponse.json(out)
}

// UR-010 (C1): wrap create in withIdempotency so a replayed offline checkout
// (the durable queue re-POSTs with the same Idempotency-Key) returns the first
// committed rig instead of creating a second deployment and double-claiming the
// operator's held stock. Body-hash bound; 5xx/409 are not cached (see idempotency.ts).
export async function POST(req: NextRequest) {
  return withIdempotency(req, 'deployments.POST', () => _POST(req))
}

async function _POST(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { note, vehicleIds, kitItems, projectId, label, sourceHubId } = parsed.data
  const operatorId = session.role === 'OPERATOR' ? session.userId : (parsed.data.operatorId ?? session.userId)

  let rig
  try {
  rig = await prisma.$transaction(async (tx) => {
    // CR-14: an operator may hold at most one active (un-ended) deployment.
    // Two active rigs make "my active rig" lookups ambiguous (findFirst silently
    // picks one) and strand items in the other. Reject up front.
    const existingActive = await getActiveRigForOperator(operatorId, tx)
    if (existingActive) {
      throw new Error('OPERATOR_HAS_ACTIVE_RIG')
    }

    const newRig = await tx.rig.create({
      data: { operatorId, projectId, label },
    })

    await ensureOpenAssignment({ rigId: newRig.id, operatorId, role: 'PRIMARY', addedById: session.userId }, tx)
    if (projectId) await addProjectLink(newRig.id, projectId, tx)

    if (vehicleIds.length > 0) {
      // Reject vehicles already held by another active deployment (open RigVehicle).
      const vehicleConflicts = await tx.rigVehicle.findMany({
        where: {
          vehicleId: { in: vehicleIds },
          removedAt: null,
          rigId: { not: newRig.id },
          rig: { endedAt: null },
        },
        select: { vehicleId: true },
      })
      if (vehicleConflicts.length > 0) {
        throw Object.assign(new Error('VEHICLE_IN_USE'), {
          vehicleIds: [...new Set(vehicleConflicts.map((c) => c.vehicleId))],
        })
      }
      await tx.rigVehicle.createMany({
        data: vehicleIds.map((vehicleId) => ({
          rigId: newRig.id,
          vehicleId,
          addNote: note,
        })),
      })
      await tx.vehicle.updateMany({
        where: { id: { in: vehicleIds } },
        data: { assignedOperatorId: operatorId },
      })
    }

    const kit = await tx.kit.create({ data: { rigId: newRig.id } })

    if (kitItems.length > 0) {
      for (const ki of kitItems) {
        if ('inventoryUnitId' in ki && ki.inventoryUnitId) {
          const result = await tx.inventoryUnit.updateMany({
            where: { id: ki.inventoryUnitId, inventoryItemId: ki.inventoryItemId, status: 'AVAILABLE', deletedAt: null },
            data: { status: 'CHECKED_OUT' },
          })
          if (result.count === 0) {
            throw Object.assign(new Error('UNIT_CONFLICT'), { unitId: ki.inventoryUnitId })
          }
          await tx.kitItem.create({
            data: { kitId: kit.id, inventoryItemId: ki.inventoryItemId, quantity: 1, inventoryUnitId: ki.inventoryUnitId },
          })
          await tx.checkLog.create({
            data: { action: 'CHECK_OUT', itemId: ki.inventoryItemId, inventoryUnitId: ki.inventoryUnitId, operatorId, rigId: newRig.id, projectId, notes: note },
          })
        } else {
          const quantity = (ki as { quantity: number }).quantity
          const item = await tx.inventoryItem.findUnique({
            where: { id: ki.inventoryItemId },
            select: { itemType: true, quantity: true },
          })
          // SERIALIZED items checked out by quantity must reserve that many real
          // AVAILABLE units. CONSUMABLE quantity is authoritative and may have no
          // units, so it is allowed to proceed without reserving any.
          const requireUnits = item?.itemType === 'SERIALIZED'
          const available = await tx.inventoryUnit.findMany({
            where: { inventoryItemId: ki.inventoryItemId, status: 'AVAILABLE', deletedAt: null },
            take: quantity,
          })
          if (requireUnits && available.length < quantity) {
            throw Object.assign(new Error('INSUFFICIENT_UNITS'), {
              available: available.length,
              requested: quantity,
            })
          }
          if (available.length > 0) {
            // Status-guarded flip: only rows still AVAILABLE transition, so a unit
            // grabbed by a concurrent checkout between the read above and this write
            // is not double-allocated — the count reconciliation catches the shortfall.
            const flipped = await tx.inventoryUnit.updateMany({
              where: { id: { in: available.map((u) => u.id) }, status: 'AVAILABLE' },
              data: { status: 'CHECKED_OUT' },
            })
            if (flipped.count < available.length) {
              throw Object.assign(new Error('UNIT_CONFLICT'), {})
            }
          }
          // CONSUMABLE stock: draw from the selected hub (MH-1). Guard prevents
          // oversell. Hard fail if insufficient — operator must pick another hub
          // or reduce qty. Dual-write: hub row (authoritative for where) +
          // InventoryItem.quantity (cross-hub total). drawnHubId recorded so the
          // return restores to the same hub (CR-1a / N-2).
          let drawnQuantity = 0
          let drawnHubId: string | null = null
          if (item?.itemType === 'CONSUMABLE') {
            if (!sourceHubId) {
              throw Object.assign(new Error('CONSUMABLE_NEEDS_HUB'), {})
            }
            // Self-heal: if this item has no stock rows at all (e.g. pre-backfill legacy
            // item or edge case), seed a stock row from the legacy quantity so checkout
            // succeeds. Only when totalStock === 0 to avoid inflating multi-hub totals.
            const existingTotal = await totalStock(ki.inventoryItemId, tx)
            if (existingTotal === 0 && (item.quantity ?? 0) >= quantity) {
              await setStockAtHub(ki.inventoryItemId, sourceHubId, item.quantity ?? 0, tx)
            }
            // UR-010: claim this operator's own HELD (reserved) stock at this hub first
            // — converts reserve→draw — then draw any remainder from free hub stock.
            // Normal reservation checkout: claimed === quantity, no free draw. Direct
            // (no-reservation) checkout: claimed === 0, it all comes from free stock.
            const claimed = await claimHeldStock(operatorId, ki.inventoryItemId, sourceHubId, quantity, tx)
            const remainder = quantity - claimed
            if (remainder > 0) {
              const drawn = await drawFromHub(ki.inventoryItemId, sourceHubId, remainder, tx)
              if (drawn < remainder) {
                const atHub = await getStockAtHub(ki.inventoryItemId, sourceHubId, tx)
                const hubRow = await tx.hub.findUnique({ where: { id: sourceHubId }, select: { name: true } })
                throw Object.assign(new Error('INSUFFICIENT_HUB_STOCK'), {
                  available: claimed + atHub,
                  requested: quantity,
                  hubName: hubRow?.name ?? sourceHubId,
                })
              }
            }
            // Recompute the cross-hub total from stock rows — covers both the claimed
            // reserve→draw and the free-stock draw in one authoritative pass.
            await resyncItemTotal(ki.inventoryItemId, tx)
            drawnQuantity = quantity
            drawnHubId = sourceHubId
          }
          await tx.kitItem.create({
            data: { kitId: kit.id, inventoryItemId: ki.inventoryItemId, quantity, inventoryUnitId: null, drawnQuantity, drawnHubId },
          })
          await tx.checkLog.create({
            data: { action: 'CHECK_OUT', itemId: ki.inventoryItemId, operatorId, rigId: newRig.id, projectId, notes: note },
          })
        }
      }
    }

    return tx.rig.findUniqueOrThrow({ where: { id: newRig.id }, include: RIG_INCLUDE })
  })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'CONSUMABLE_NEEDS_HUB') {
      return NextResponse.json(
        { error: 'A source hub is required when checking out consumable items.' },
        { status: 400 }
      )
    }
    if (err instanceof Error && err.message === 'INSUFFICIENT_HUB_STOCK') {
      const e = err as Error & { available?: number; requested?: number; hubName?: string }
      return NextResponse.json(
        { error: `Only ${e.available ?? 0} available at ${e.hubName ?? 'the selected hub'} (requested ${e.requested ?? 0}).` },
        { status: 409 }
      )
    }
    if (err instanceof Error && err.message === 'UNIT_CONFLICT') {
      return NextResponse.json(
        { error: 'A selected unit was just checked out by someone else. Please select a different unit and try again.' },
        { status: 409 }
      )
    }
    if (err instanceof Error && err.message === 'INSUFFICIENT_UNITS') {
      const e = err as Error & { available?: number; requested?: number }
      return NextResponse.json(
        { error: `Only ${e.available ?? 0} of ${e.requested ?? 0} units are available for one of the selected items.` },
        { status: 409 }
      )
    }
    if (err instanceof Error && err.message === 'VEHICLE_IN_USE') {
      return NextResponse.json(
        { error: 'One or more vehicles are already assigned to another active deployment. Remove them there first.' },
        { status: 409 }
      )
    }
    if (err instanceof Error && err.message === 'OPERATOR_HAS_ACTIVE_RIG') {
      return NextResponse.json(
        { error: 'This operator already has an active deployment. End it before starting a new one.' },
        { status: 409 }
      )
    }
    // W0-10 PR-2b: a partial-unique violation (index A one-open-PRIMARY-per-operator, or
    // index C once live) that slipped the app guards under a concurrent race surfaces as
    // Prisma P2002 / PG 23505 — translate to a friendly 409 rather than a raw 500.
    const code = (err as { code?: string }).code
    if (code === 'P2002' || code === '23505') {
      return NextResponse.json(
        { error: "Can't start this deployment — the operator or one of the vehicles is already on another active deployment. End or free it there first, then try again." },
        { status: 409 }
      )
    }
    // Return the actual error as JSON instead of re-throwing (which produces non-JSON 500)
    const msg = err instanceof Error ? err.message : 'Failed to create deployment'
    console.error('[POST /api/deployments]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json(await hydrateRigOperator(rig), { status: 201 })
}
