import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { reserveAtHub, releaseAtHub } from '@/lib/inventory-stock'

// M6 / Addendum §F — Deployment Requests data layer. Raw SQL (no generated-client
// coupling, same approach as lib/checklist-templates). R1 extends the original
// create→list→submit→cancel slice with the RESERVATION/MATERIAL discriminator,
// routing + lifecycle columns, and a full 8-action state machine.
// R4 adds hub-stock hard-reserve: confirm/prepare reserves CONSUMABLE KIT_ITEM lines;
// cancel/fulfill from STAGED releases them. Guarded by stockReservedAt idempotency.

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

export type TransitionResult =
  | { ok: true }
  | { ok: false; code: 'STATE_MISMATCH' | 'TYPE_MISMATCH' | 'INSUFFICIENT_STOCK'; shortItems?: string[] }

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
  fulfillerHubName: string | null
  fulfillerOperatorId: string | null
  decisionNote: string | null
  decidedAt: Date | null
  fulfilledAt: Date | null
  stockReservedAt: Date | null
}

interface LineRow {
  id: string
  lineType: string
  categoryId: string | null
  categoryName: string | null
  itemType: string | null
  vehicleType: string | null
  requestedQty: number
  specificInventoryItemId: string | null
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
             r."fulfillerHubId", fh."name" AS "fulfillerHubName",
             r."fulfillerOperatorId", r."decisionNote", r."decidedAt", r."fulfilledAt",
             r."stockReservedAt",
             u."name" AS "requestedByName", fo."name" AS "forOperatorName", p."name" AS "projectName",
             (SELECT count(*)::int FROM "deployment_request_lines" l WHERE l."requestId" = r."id") AS "lineCount"
      FROM "deployment_requests" r
      LEFT JOIN "users" u ON u."id" = r."requestedById"
      LEFT JOIN "users" fo ON fo."id" = r."forOperatorId"
      LEFT JOIN "projects" p ON p."id" = r."projectId"
      LEFT JOIN "hubs" fh ON fh."id" = r."fulfillerHubId"
      WHERE r."requestedById" = ${requestedById}
      ORDER BY r."createdAt" DESC
    `
  }
  return prisma.$queryRaw<RequestRow[]>`
    SELECT r."id", r."status"::text AS "status", r."requestType"::text AS "requestType",
           r."label", r."notes", r."neededBy", r."createdAt",
           r."fulfillerHubId", fh."name" AS "fulfillerHubName",
           r."fulfillerOperatorId", r."decisionNote", r."decidedAt", r."fulfilledAt",
           r."stockReservedAt",
           u."name" AS "requestedByName", fo."name" AS "forOperatorName", p."name" AS "projectName",
           (SELECT count(*)::int FROM "deployment_request_lines" l WHERE l."requestId" = r."id") AS "lineCount"
    FROM "deployment_requests" r
    LEFT JOIN "users" u ON u."id" = r."requestedById"
    LEFT JOIN "users" fo ON fo."id" = r."forOperatorId"
    LEFT JOIN "projects" p ON p."id" = r."projectId"
    LEFT JOIN "hubs" fh ON fh."id" = r."fulfillerHubId"
    ORDER BY r."createdAt" DESC
  `
}

export async function getRequest(id: string): Promise<{ request: RequestRow; lines: LineRow[]; requestedById: string } | null> {
  const rows = await prisma.$queryRaw<(RequestRow & { requestedById: string })[]>`
    SELECT r."id", r."status"::text AS "status", r."requestType"::text AS "requestType",
           r."label", r."notes", r."neededBy", r."createdAt", r."requestedById",
           r."fulfillerHubId", fh."name" AS "fulfillerHubName",
           r."fulfillerOperatorId", r."decisionNote", r."decidedAt", r."fulfilledAt",
           r."stockReservedAt",
           u."name" AS "requestedByName", fo."name" AS "forOperatorName", p."name" AS "projectName",
           (SELECT count(*)::int FROM "deployment_request_lines" l WHERE l."requestId" = r."id") AS "lineCount"
    FROM "deployment_requests" r
    LEFT JOIN "users" u ON u."id" = r."requestedById"
    LEFT JOIN "users" fo ON fo."id" = r."forOperatorId"
    LEFT JOIN "projects" p ON p."id" = r."projectId"
    LEFT JOIN "hubs" fh ON fh."id" = r."fulfillerHubId"
    WHERE r."id" = ${id}
  `
  const request = rows[0]
  if (!request) return null
  const lines = await prisma.$queryRaw<LineRow[]>`
    SELECT l."id", l."lineType"::text AS "lineType", l."categoryId", c."name" AS "categoryName",
           l."itemType", l."vehicleType"::text AS "vehicleType", l."requestedQty",
           l."specificInventoryItemId", l."specificInventoryUnitId", l."description", l."reorderUrl",
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

// ── Internal helpers ──────────────────────────────────────────────────────────

type RawTx = Pick<typeof prisma, '$executeRaw' | '$queryRaw'>

/** Release all reserved consumable stock for a request if stockReservedAt is set. */
async function releaseReservedStock(requestId: string, tx: RawTx): Promise<void> {
  const reqRows = await tx.$queryRaw<{ stockReservedAt: Date | null; fulfillerHubId: string | null }[]>`
    SELECT "stockReservedAt", "fulfillerHubId" FROM "deployment_requests" WHERE "id" = ${requestId}
  `
  const req = reqRows[0]
  if (!req?.stockReservedAt || !req?.fulfillerHubId) return

  const lines = await tx.$queryRaw<{ specificInventoryItemId: string; requestedQty: number }[]>`
    SELECT l."specificInventoryItemId", l."requestedQty"
    FROM "deployment_request_lines" l
    JOIN "inventory_items" ii ON ii."id" = l."specificInventoryItemId"
    WHERE l."requestId" = ${requestId}
      AND l."lineType" = 'KIT_ITEM'
      AND l."specificInventoryItemId" IS NOT NULL
      AND ii."itemType" = 'CONSUMABLE'
  `
  for (const line of lines) {
    await releaseAtHub(line.specificInventoryItemId, req.fulfillerHubId, line.requestedQty, tx)
  }
}

// ── State machine ─────────────────────────────────────────────────────────────

/**
 * Apply a state-machine transition. Returns a structured result so callers can
 * distinguish state mismatches from insufficient-stock failures (R4).
 *
 * Actions and their guards:
 *   submit   — both types:        DRAFT → REQUESTED
 *   cancel   — RESERVATION:       {DRAFT,REQUESTED,STAGED} → CANCELLED (releases stock if STAGED)
 *              MATERIAL:           {DRAFT,REQUESTED,FORWARDED} → CANCELLED
 *   confirm  — RESERVATION only:  REQUESTED → STAGED (reserves CONSUMABLE KIT_ITEM lines)
 *   prepare  — alias for confirm
 *   decline  — both types:        REQUESTED → DENIED (never staged → no release needed)
 *   fulfill  — RESERVATION:       STAGED → FULFILLED (releases stock before marking fulfilled)
 *              MATERIAL:           REQUESTED → FULFILLED
 *   forward  — MATERIAL only:     REQUESTED → FORWARDED (sets fulfiller*)
 *   complete — MATERIAL only:     FORWARDED → FULFILLED
 */
export async function applyRequestTransition(
  id: string,
  action: RequestAction,
  requestType: string,
  extra?: TransitionExtra,
): Promise<TransitionResult> {
  switch (action) {
    case 'submit': {
      const n = await prisma.$executeRaw`
        UPDATE "deployment_requests" SET "status" = 'REQUESTED', "updatedAt" = now()
        WHERE "id" = ${id} AND "status" = 'DRAFT'
      `
      return Number(n) > 0 ? { ok: true } : { ok: false, code: 'STATE_MISMATCH' }
    }

    case 'cancel': {
      if (requestType === 'MATERIAL') {
        const n = await prisma.$executeRaw`
          UPDATE "deployment_requests" SET "status" = 'CANCELLED', "updatedAt" = now()
          WHERE "id" = ${id} AND "status" IN ('DRAFT', 'REQUESTED', 'FORWARDED')
        `
        return Number(n) > 0 ? { ok: true } : { ok: false, code: 'STATE_MISMATCH' }
      }
      return prisma.$transaction(async (tx) => {
        await releaseReservedStock(id, tx)
        const n = await tx.$executeRaw`
          UPDATE "deployment_requests"
          SET "status" = 'CANCELLED', "updatedAt" = now(), "stockReservedAt" = NULL
          WHERE "id" = ${id} AND "status" IN ('DRAFT', 'REQUESTED', 'STAGED')
        `
        return Number(n) > 0 ? ({ ok: true } as TransitionResult) : ({ ok: false, code: 'STATE_MISMATCH' } as TransitionResult)
      })
    }

    case 'confirm':
    case 'prepare': {
      if (requestType !== 'RESERVATION') return { ok: false, code: 'TYPE_MISMATCH' }
      try {
        return await prisma.$transaction(async (tx) => {
          // Guard: flip status and set idempotency stamp in one UPDATE
          const n = await tx.$executeRaw`
            UPDATE "deployment_requests"
            SET "status" = 'STAGED', "updatedAt" = now(), "decidedAt" = now(),
                "decisionNote" = ${extra?.decisionNote ?? null},
                "stockReservedAt" = now()
            WHERE "id" = ${id} AND "status" = 'REQUESTED' AND "stockReservedAt" IS NULL
          `
          if (Number(n) === 0) throw Object.assign(new Error('STATE_MISMATCH'), { _code: 'STATE_MISMATCH' })

          // Resolve fulfillerHubId (may be on the request already or passed in extra)
          const reqRows = await tx.$queryRaw<{ fulfillerHubId: string | null }[]>`
            SELECT "fulfillerHubId" FROM "deployment_requests" WHERE "id" = ${id}
          `
          const fulfillerHubId = reqRows[0]?.fulfillerHubId ?? extra?.fulfillerHubId ?? null
          if (!fulfillerHubId) return { ok: true } as TransitionResult

          // Reserve each CONSUMABLE KIT_ITEM line with a specific item
          const lines = await tx.$queryRaw<{ specificInventoryItemId: string; itemName: string | null; requestedQty: number }[]>`
            SELECT l."specificInventoryItemId", ii."name" AS "itemName", l."requestedQty"
            FROM "deployment_request_lines" l
            JOIN "inventory_items" ii ON ii."id" = l."specificInventoryItemId"
            WHERE l."requestId" = ${id}
              AND l."lineType" = 'KIT_ITEM'
              AND l."specificInventoryItemId" IS NOT NULL
              AND ii."itemType" = 'CONSUMABLE'
          `

          const shortItems: string[] = []
          for (const line of lines) {
            const ok = await reserveAtHub(line.specificInventoryItemId, fulfillerHubId, line.requestedQty, tx)
            if (!ok) shortItems.push(line.itemName ?? line.specificInventoryItemId)
          }

          if (shortItems.length > 0) {
            throw Object.assign(new Error('INSUFFICIENT_STOCK'), { _code: 'INSUFFICIENT_STOCK', _shortItems: shortItems })
          }
          return { ok: true } as TransitionResult
        })
      } catch (err: unknown) {
        const e = err as { _code?: string; _shortItems?: string[] }
        if (e._code === 'STATE_MISMATCH') return { ok: false, code: 'STATE_MISMATCH' }
        if (e._code === 'INSUFFICIENT_STOCK') return { ok: false, code: 'INSUFFICIENT_STOCK', shortItems: e._shortItems ?? [] }
        throw err
      }
    }

    case 'decline': {
      const n = await prisma.$executeRaw`
        UPDATE "deployment_requests"
        SET "status" = 'DENIED', "updatedAt" = now(), "decidedAt" = now(),
            "decisionNote" = ${extra?.decisionNote ?? null}
        WHERE "id" = ${id} AND "status" = 'REQUESTED'
      `
      return Number(n) > 0 ? { ok: true } : { ok: false, code: 'STATE_MISMATCH' }
    }

    case 'fulfill': {
      if (requestType === 'MATERIAL') {
        const n = await prisma.$executeRaw`
          UPDATE "deployment_requests"
          SET "status" = 'FULFILLED', "updatedAt" = now(), "fulfilledAt" = now(),
              "decisionNote" = ${extra?.decisionNote ?? null}
          WHERE "id" = ${id} AND "status" = 'REQUESTED'
        `
        return Number(n) > 0 ? { ok: true } : { ok: false, code: 'STATE_MISMATCH' }
      }
      // RESERVATION: release reserves then mark fulfilled
      return prisma.$transaction(async (tx) => {
        await releaseReservedStock(id, tx)
        const n = await tx.$executeRaw`
          UPDATE "deployment_requests"
          SET "status" = 'FULFILLED', "updatedAt" = now(), "fulfilledAt" = now(),
              "stockReservedAt" = NULL
          WHERE "id" = ${id} AND "status" = 'STAGED'
        `
        return Number(n) > 0 ? ({ ok: true } as TransitionResult) : ({ ok: false, code: 'STATE_MISMATCH' } as TransitionResult)
      })
    }

    case 'forward': {
      if (requestType !== 'MATERIAL') return { ok: false, code: 'TYPE_MISMATCH' }
      const n = await prisma.$executeRaw`
        UPDATE "deployment_requests"
        SET "status" = 'FORWARDED', "updatedAt" = now(),
            "fulfillerHubId" = ${extra?.fulfillerHubId ?? null},
            "fulfillerOperatorId" = ${extra?.fulfillerOperatorId ?? null},
            "decisionNote" = ${extra?.decisionNote ?? null}
        WHERE "id" = ${id} AND "status" = 'REQUESTED'
      `
      return Number(n) > 0 ? { ok: true } : { ok: false, code: 'STATE_MISMATCH' }
    }

    case 'complete': {
      if (requestType !== 'MATERIAL') return { ok: false, code: 'TYPE_MISMATCH' }
      const n = await prisma.$executeRaw`
        UPDATE "deployment_requests"
        SET "status" = 'FULFILLED', "updatedAt" = now(), "fulfilledAt" = now()
        WHERE "id" = ${id} AND "status" = 'FORWARDED'
      `
      return Number(n) > 0 ? { ok: true } : { ok: false, code: 'STATE_MISMATCH' }
    }

    default:
      return { ok: false, code: 'STATE_MISMATCH' }
  }
}
