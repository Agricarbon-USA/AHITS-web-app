import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'

// M6 / Addendum §F — Deployment Requests data layer. Raw SQL (no generated-client
// coupling, same approach as lib/checklist-templates). This slice covers
// create → list → submit → cancel; staging/checkout land with #29.

export const LINE_TYPES = ['KIT_ITEM', 'VEHICLE'] as const
export type LineType = (typeof LINE_TYPES)[number]
export const VEHICLE_TYPES = ['TRUCK', 'TRAILER', 'POLARIS_UTV', 'CAN_AM_UTV', 'CHRISTIE_DRILL', 'ATV', 'OTHER'] as const

export interface RequestLineInput {
  lineType: LineType
  categoryId?: string | null
  itemType?: string | null
  vehicleType?: string | null
  requestedQty: number
  specificInventoryItemId?: string | null
  specificVehicleId?: string | null
}

export interface CreateRequestInput {
  label?: string | null
  notes?: string | null
  neededBy?: Date | null
  projectId?: string | null
  forOperatorId?: string | null
  status: 'DRAFT' | 'REQUESTED'
  lines: RequestLineInput[]
}

interface RequestRow {
  id: string
  status: string
  label: string | null
  notes: string | null
  neededBy: Date | null
  createdAt: Date
  requestedByName: string | null
  forOperatorName: string | null
  projectName: string | null
  lineCount: number
}

interface LineRow {
  id: string
  lineType: string
  categoryId: string | null
  categoryName: string | null
  itemType: string | null
  vehicleType: string | null
  requestedQty: number
}

/** List requests (newest first). Optionally scope to one requester (operators see their own). */
export async function listRequests(requestedById?: string): Promise<RequestRow[]> {
  if (requestedById) {
    return prisma.$queryRaw<RequestRow[]>`
      SELECT r."id", r."status"::text AS "status", r."label", r."notes", r."neededBy", r."createdAt",
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
    SELECT r."id", r."status"::text AS "status", r."label", r."notes", r."neededBy", r."createdAt",
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
    SELECT r."id", r."status"::text AS "status", r."label", r."notes", r."neededBy", r."createdAt", r."requestedById",
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
           l."itemType", l."vehicleType"::text AS "vehicleType", l."requestedQty"
    FROM "deployment_request_lines" l
    LEFT JOIN "categories" c ON c."id" = l."categoryId"
    WHERE l."requestId" = ${id}
    ORDER BY l."createdAt" ASC
  `
  return { request, lines, requestedById: request.requestedById }
}

export async function createRequest(input: CreateRequestInput, requestedById: string): Promise<string> {
  const id = randomUUID()
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "deployment_requests" ("id", "status", "label", "notes", "neededBy", "projectId", "forOperatorId", "requestedById")
      VALUES (${id}, ${input.status}::"DeploymentRequestStatus", ${input.label ?? null}, ${input.notes ?? null},
              ${input.neededBy ?? null}, ${input.projectId ?? null}, ${input.forOperatorId ?? null}, ${requestedById})
    `
    for (const line of input.lines) {
      await tx.$executeRaw`
        INSERT INTO "deployment_request_lines"
          ("id", "requestId", "lineType", "categoryId", "itemType", "vehicleType", "requestedQty", "specificInventoryItemId", "specificVehicleId")
        VALUES (${randomUUID()}, ${id}, ${line.lineType}::"RequestLineType", ${line.categoryId ?? null}, ${line.itemType ?? null},
                ${line.vehicleType ?? null}::"VehicleType", ${Math.max(1, Math.floor(line.requestedQty || 1))},
                ${line.specificInventoryItemId ?? null}, ${line.specificVehicleId ?? null})
      `
    }
  })
  return id
}

/** Submit (DRAFT→REQUESTED) or cancel (DRAFT/REQUESTED/STAGED→CANCELLED). Returns false if no row matched the guard. */
export async function transitionRequest(id: string, action: 'submit' | 'cancel'): Promise<boolean> {
  if (action === 'submit') {
    const n = await prisma.$executeRaw`
      UPDATE "deployment_requests" SET "status" = 'REQUESTED', "updatedAt" = now()
      WHERE "id" = ${id} AND "status" = 'DRAFT'
    `
    return Number(n) > 0
  }
  const n = await prisma.$executeRaw`
    UPDATE "deployment_requests" SET "status" = 'CANCELLED', "updatedAt" = now()
    WHERE "id" = ${id} AND "status" IN ('DRAFT', 'REQUESTED', 'STAGED')
  `
  return Number(n) > 0
}
