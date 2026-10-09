import { prisma } from '@/lib/prisma'
import { getDeploymentRosterForDisplay, hydrateTransfersFromRig } from '@/lib/deployment-assignments'
import { resolveMyRigId } from '@/lib/rig-list'
import { getRigChecksForDay } from '@/lib/rig-daily-checks'
import { listRequests, getAwaitingPickupForOperator } from '@/lib/deployment-requests'
import { listHandoffs } from '@/lib/deployment-handoffs'
import { businessDate } from '@/lib/business-date'

// CC-14 (NS-10) · the read-side assembly behind GET /api/operator/today. Pure reads
// over Rig / RigVehicle / DailyCheck / TransferRequest / DeploymentHandoff /
// DeploymentRequest — every query already existed elsewhere; this composes them into
// the one payload the operator "Today" surface consumes. Zero schema. Lives in lib
// (not inline in the route) so it's testable with fixtures like the other read paths.

// Trimmed rig include — operator/project come from the roster helper (the authoritative
// deployment_projects M2M), NOT the legacy Rig.projectId column, exactly like the
// deployments GET. Vehicle select adds location + notes + odometer so Today can show
// the day's site/access context read-only (no "access notes" field exists; Vehicle.notes
// + .location are the read-only context per NS-10's "and any access notes" clause).
const RIG_INCLUDE_TODAY = {
  vehicles: {
    where: { removedAt: null },
    include: {
      vehicle: {
        select: {
          id: true,
          name: true,
          type: true,
          isRental: true,
          rentalAgreementUrl: true,
          location: true,
          notes: true,
          odometer: true,
        },
      },
    },
  },
} as const

const TRANSFER_INCLUDE = {
  fromRig: true,
  toOperator: { select: { id: true, name: true } },
  vehicles: { include: { vehicle: { select: { id: true, name: true, type: true } } } },
  items: { include: { kitItem: { include: { item: { select: { id: true, name: true } } } } } },
} as const

export async function getOperatorToday(userId: string, role: string) {
  const today = new Date(businessDate()) // business-day date, APP_TIMEZONE — matches the daily-check upsert key

  // PR-5c (L-8): the same resolver as /api/deployments/mine — a SECONDARY sees their
  // crew rig. Null when not deployed (Today still renders the waiting/requests
  // sections + an empty state, so everything downstream tolerates rigId === null).
  const rigId = await resolveMyRigId(userId)

  const [rig, roster, todayChecks, crewChecks, transfersRaw, handoffs, requests, awaitingPickup] = await Promise.all([
    rigId ? prisma.rig.findUnique({ where: { id: rigId }, include: RIG_INCLUDE_TODAY }) : Promise.resolve(null),
    rigId ? getDeploymentRosterForDisplay(rigId) : Promise.resolve(null),
    // This operator's own daily checks filed for the business "today".
    prisma.dailyCheck.findMany({
      where: { operatorId: userId, date: today },
      select: { id: true, vehicleId: true, site: true, odometer: true, submittedAt: true },
    }),
    // PR-5c: the rig's checks are shared — the first crew check per rig vehicle today.
    rigId ? getRigChecksForDay(rigId, today) : Promise.resolve(new Map()),
    prisma.transferRequest.findMany({
      where: { toOperatorId: userId, status: 'PENDING' },
      include: TRANSFER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    }),
    listHandoffs({ userId, role, direction: 'incoming', status: 'PENDING' }),
    listRequests(userId),
    getAwaitingPickupForOperator(userId),
  ])

  const transfers = await hydrateTransfersFromRig(transfersRaw)

  // Per-vehicle done/due (PR-5c): a rig vehicle is "done" once ANY crew member checked
  // it today — done for everyone, with who and when (`vehicleChecks`). The operator's own
  // checks of other vehicles still count for their own list, as before.
  const vehicleChecks = [...crewChecks.values()].map((c) => ({
    vehicleId: c.vehicleId,
    checkId: c.checkId,
    operatorId: c.operatorId,
    operatorName: c.operatorName,
    submittedAt: c.submittedAt,
    byMe: c.operatorId === userId,
  }))
  const checkedVehicleIds = [...new Set([...todayChecks.map((c) => c.vehicleId), ...crewChecks.keys()])]
  // Today's site, if the operator already entered one on any of today's checks (read-only).
  const todaySite = todayChecks.find((c) => c.site && c.site.trim() !== '')?.site ?? null
  // PR-5c: is the caller the rig's PRIMARY? Drives the one-line notes on Today's card.
  const isPrimary = !!roster?.operator && roster.operator.id === userId

  const deployment = rig
    ? {
        id: rig.id,
        label: rig.label,
        startedAt: rig.startedAt,
        notes: rig.notes,
        operator: roster?.operator ? { id: roster.operator.id, name: roster.operator.name } : null,
        secondaryOperators: roster?.secondaryOperators ?? [],
        project: roster?.projects[0] ?? null,
        vehicles: rig.vehicles,
        site: todaySite,
        isPrimary,
      }
    : null

  return {
    deployment,
    checkedVehicleIds,
    vehicleChecks,
    transfers,
    handoffs,
    requests,
    awaitingPickup,
    asOf: new Date().toISOString(),
  }
}
