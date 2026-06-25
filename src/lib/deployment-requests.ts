import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'

// M6 / Addendum §F — Deployment Requests data layer. Raw SQL (no generated-client
// coupling, same approach as lib/checklist-templates). R1 extends the original
// create→list→submit→cancel slice with the RESERVATION/MATERIAL discriminator,
// routing + lifecycle columns, and a full 8-action state machine.

export const LINE_TYPES = ['KIT_ITEM', 'VEHICLE', 'NEW_PURCHASE', 'SHIPPING_LABEL'] as const
export type LineType = (typeof LINE_TYPES)[number]
export const VEHICLE_TYPES = ['TRUCK', 'TRAILER', 'POLARIS_UTV', 'CAN_AM_UTV', 'CHRISTIE_DRILL', 'ATV', 'OTHER'] as const

export const REQUEST_TYPES = ['RESERVATION', 'MATERIAL'] as const
export type RequestType = (typeof REQUEST_TYPES)[number]

export type RequestAction = 'submit' | 'cancel' | 'confirm' | 'prepare' | 'decline' | 'fulfill' | 'forward' | 'complete'

export interface RequestLineInput {
  lineType: LineType
  categoryId?: string | null
  itemType?: string | null
  vehicleType?: string | null
  requestedQty: number
  specificInventoryItemId?: string | null
  specificVehicleId?: string | null
  specificInventoryUnitId?: string | null
  description?: string | null
  reorderUrl?: string | null
}

export interface CreateRequestInput {
  requestType?: RequestType
  label?: string | null
  notes?: string | null
  neededBy?: Date | null
  projectId?: string | null
  forOperatorId?: string | null
  fulfillerHubId?: string | null
  fulfillerOperatorId?: string | null
  status: 'DRAFT' | 'REQUESTED'
  lines: RequestLineInput[]
}

export interface TransitionExtra {
  fulfillerHubId?: string | null
  fulfillerOperatorId?: string | null
  decisionNote?: string | null
}

interface RequestRow {
  id: string
  status: string
  requestType: string
  label: string | null
  notes: string | null
  neededBy: Date | null
  createdAt: Date
  requestedByName: string | null
  forOperatorName: string | null
  projectName: string | null
  lineCount: number
  fulfillerHubId: string | null
  fulfillerOperatorId: string | null
  decisionNote: string | null
  decidedAt: Date | null
  fulfilledAt: Date | null
}

interface LineRow {
  id: string
  lineType: string
  categoryId: string | null
  categoryName: string | null
  itemType: string | null
  vehicleType: string | null
  requestedQty: number
  specificInventoryUnitId: string | null
  specificItemName: string | null
  specificVehicleName: string | null
  specificUnitSerial: string | null
  description: string | null
  reorderUrl: string | null
}

/** List requests (newest first). Optionally scope to one requester (operators see their own). */
export async function listRequests(requestedById?: string): Promise<RequestRow[]> {
  if (requestedById) {
    return prisma.$queryRaw<RequestRow[]>`
      SELECT r."id", r."status"::text AS "status", r."requestType"::text AS "requestType",
             r."label", r."notes", r."neededBy", r."createdAt",
             r."fulfillerHubId", r."fulfillerOperatorId", r."decisionNote", r."decidedAt", r."fulfilledAt",
             u."name" AS "requestedByName", fo."name" AS "forOperatorName", p."name" AS "projectName",
             (SELECT count(*)::int FROM "deployment_request_lines" l WHERE l."requestId" = r."id") AS "lineCount"
      FROM "deployment_requests" r
      LEFT JOIN "users" u ON u."id" = r."requestedById"
      LEFT JOIN "users" fo ON fo."id" = r."forOperatorId"
      LEFT JOIN "projects" p ON p."id" = r."projectId"
      WHERE r."requestedById" = ${requestedById}
      ORDER BY r."createdAt" DESC
    `
  }
  return prisma.$queryRaw<RequestRow[]>`
    SELECT r."id", r."status"::text AS "status", r."requestType"::text AS "requestType",
           r."label", r."notes", r."neededBy", r."createdAt",
           r."fulfillerHubId", r."fulfillerOperatorId", r."decisionNote", r."decidedAt", r."fulfilledAt",
           u."name" AS "requestedByName", fo."name" AS "forOperatorName", p."name" AS "projectName",
           (SELECT count(*)::int FROM "deployment_request_lines" l WHERE l."requestId" = r."id") AS "lineCount"
    FROM "deployment_requests" r
    LEFT JOIN "users" u ON u."id" = r."requestedById"
    LEFT JOIN "users" fo ON fo."id" = r."forOperatorId"
    LEFT JOIN "projects" p ON p."id" = r."projectId"
    ORDER BY r."createdAt" DESC
  `
}

export async function getRequest(id: string): Promise<{ request: RequestRow; lines: LineRow[]; requestedById: string } | null> {
  const rows = await prisma.$queryRaw<(RequestRow & { requestedById: string })[]>`
    SELECT r."id", r."status"::text AS "status", r."requestType"::text AS "requestType",
           r."label", r."notes", r."neededBy", r."createdAt", r."requestedById",
           r."fulfillerHubId", r."fulfillerOperatorId", r."decisionNote", r."decidedAt", r."fulfilledAt",
           u."name" AS "requestedByName", fo."name" AS "forOperatorName", p."name" AS "projectName",
           (SELECT count(*)::int FROM "deployment_request_lines" l WHERE l."requestId" = r."id") AS "lineCount"
    FROM "deployment_requests" r
    LEFT JOIN "users" u ON u."id" = r."requestedById"
    LEFT JOIN "users" fo ON fo."id" = r."forOperatorId"
    LEFT JOIN "projects" p ON p."id" = r."projectId"
    WHERE r."id" = ${id}
  `
  const request = rows[0]
  if (!request) return null
  const lines = await prisma.$queryRaw<LineRow[]>`
    SELECT l."id", l."lineType"::text AS "lineType", l."categoryId", c."name" AS "categoryName",
           l."itemType", l."vehicleType"::text AS "vehicleType", l."requestedQty",
           l."specificInventoryUnitId", l."description", l."reorderUrl",
           ii."name" AS "specificItemName",
           v."name" AS "specificVehicleName",
           iu."serialNumber" AS "specificUnitSerial"
    FROM "deployment_request_lines" l
    LEFT JOIN "categories" c ON c."id" = l."categoryId"
    LEFT JOIN "inventory_items" ii ON ii."id" = l."specificInventoryItemId"
    LEFT JOIN "vehicles" v ON v."id" = l."specificVehicleId"
    LEFT JOIN "inventory_units" iu ON iu."id" = l."specificInventoryUnitId"
    WHERE l."requestId" = ${id}
    ORDER BY l."createdAt" ASC
  `
  return { request, lines, requestedById: request.requestedById }
}

export async function createRequest(input: CreateRequestInput, requestedById: string): Promise<string> {
  const id = randomUUID()
  const requestType = input.requestType ?? 'RESERVATION'
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "deployment_requests"
        ("id", "status", "requestType", "label", "notes", "neededBy", "projectId", "forOperatorId",
         "requestedById", "fulfillerHubId", "fulfillerOperatorId")
      VALUES (${id}, ${input.status}::"DeploymentRequestStatus", ${requestType}::"DeploymentRequestType",
              ${input.label ?? null}, ${input.notes ?? null}, ${input.neededBy ?? null},
              ${input.projectId ?? null}, ${input.forOperatorId ?? null}, ${requestedById},
              ${input.fulfillerHubId ?? null}, ${input.fulfillerOperatorId ?? null})
    `
    for (const line of input.lines) {
      await tx.$executeRaw`
        INSERT INTO "deployment_request_lines"
          ("id", "requestId", "lineType", "categoryId", "itemType", "vehicleType", "requestedQty",
           "specificInventoryItemId", "specificVehicleId",
           "specificInventoryUnitId", "description", "reorderUrl")
        VALUES (${randomUUID()}, ${id}, ${line.lineType}::"RequestLineType",
                ${line.categoryId ?? null}, ${line.itemType ?? null},
                ${line.vehicleType ?? null}::"VehicleType",
                ${Math.max(1, Math.floor(line.requestedQty || 1))},
                ${line.specificInventoryItemId ?? null}, ${line.specificVehicleId ?? null},
                ${line.specificInventoryUnitId ?? null}, ${line.description ?? null}, ${line.reorderUrl ?? null})
      `
    }
  })
  return id
}

/**
 * Apply a state-machine transition. Guards are checked via the WHERE clause
 * (returns false if no row matched, i.e. status/type guard failed → 409 in the route).
 *
 * Actions and their guards:
 *   submit   — both types:        DRAFT → REQUESTED
 *   cancel   — RESERVATION:       {DRAFT,REQUESTED,STAGED} → CANCELLED
 *              MATERIAL:           {DRAFT,REQUESTED,FORWARDED} → CANCELLED
 *   confirm  — RESERVATION only:  REQUESTED → STAGED (sets decidedAt + decisionNote)
 *   prepare  — alias for confirm
 *   decline  — both types:        REQUESTED → DENIED
 *   fulfill  — RESERVATION:       STAGED → FULFILLED
 *              MATERIAL:           REQUESTED → FULFILLED
 *   forward  — MATERIAL only:     REQUESTED → FORWARDED (sets fulfiller*)
 *   complete — MATERIAL only:     FORWARDED → FULFILLED
 */
export async function applyRequestTransition(
  id: string,
  action: RequestAction,
  requestType: string,
  extra?: TransitionExtra,
): Promise<boolean> {
  switch (action) {
    case 'submit': {
      const n = await prisma.$executeRaw`
        UPDATE "deployment_requests" SET "status" = 'REQUESTED', "updatedAt" = now()
        WHERE "id" = ${id} AND "status" = 'DRAFT'
      `
      return Number(n) > 0
    }
    case 'cancel': {
      if (requestType === 'MATERIAL') {
        const n = await prisma.$executeRaw`
          UPDATE "deployment_requests" SET "status" = 'CANCELLED', "updatedAt" = now()
          WHERE "id" = ${id} AND "status" IN ('DRAFT', 'REQUESTED', 'FORWARDED')
        `
        return Number(n) > 0
      }
      const n = await prisma.$executeRaw`
        UPDATE "deployment_requests" SET "status" = 'CANCELLED', "updatedAt" = now()
        WHERE "id" = ${id} AND "status" IN ('DRAFT', 'REQUESTED', 'STAGED')
      `
      return Number(n) > 0
    }
    case 'confirm':
    case 'prepare': {
      if (requestType !== 'RESERVATION') return false
      const n = await prisma.$executeRaw`
        UPDATE "deployment_requests"
        SET "status" = 'STAGED', "updatedAt" = now(), "decidedAt" = now(),
            "decisionNote" = ${extra?.decisionNote ?? null}
        WHERE "id" = ${id} AND "status" = 'REQUESTED'
      `
      return Number(n) > 0
    }
    case 'decline': {
      const n = await prisma.$executeRaw`
        UPDATE "deployment_requests"
        SET "status" = 'DENIED', "updatedAt" = now(), "decidedAt" = now(),
            "decisionNote" = ${extra?.decisionNote ?? null}
        WHERE "id" = ${id} AND "status" = 'REQUESTED'
      `
      return Number(n) > 0
    }
    case 'fulfill': {
      if (requestType === 'MATERIAL') {
        const n = await prisma.$executeRaw`
          UPDATE "deployment_requests"
          SET "status" = 'FULFILLED', "updatedAt" = now(), "fulfilledAt" = now(),
              "decisionNote" = ${extra?.decisionNote ?? null}
          WHERE "id" = ${id} AND "status" = 'REQUESTED'
        `
        return Number(n) > 0
      }
      const n = await prisma.$executeRaw`
        UPDATE "deployment_requests"
        SET "status" = 'FULFILLED', "updatedAt" = now(), "fulfilledAt" = now()
        WHERE "id" = ${id} AND "status" = 'STAGED'
      `
      return Number(n) > 0
    }
    case 'forward': {
      if (requestType !== 'MATERIAL') return false
      const n = await prisma.$executeRaw`
        UPDATE "deployment_requests"
        SET "status" = 'FORWARDED', "updatedAt" = now(),
            "fulfillerHubId" = ${extra?.fulfillerHubId ?? null},
            "fulfillerOperatorId" = ${extra?.fulfillerOperatorId ?? null},
            "decisionNote" = ${extra?.decisionNote ?? null}
        WHERE "id" = ${id} AND "status" = 'REQUESTED'
      `
      return Number(n) > 0
    }
    case 'complete': {
      if (requestType !== 'MATERIAL') return false
      const n = await prisma.$executeRaw`
        UPDATE "deployment_requests"
        SET "status" = 'FULFILLED', "updatedAt" = now(), "fulfilledAt" = now()
        WHERE "id" = ${id} AND "status" = 'FORWARDED'
      `
      return Number(n) > 0
    }
    default:
      return false
  }
}
