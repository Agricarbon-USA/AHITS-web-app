import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { reserveAtHub, releaseAtHub } from '@/lib/inventory-stock'

// M6 / Addendum §F — Deployment Requests data layer. Raw SQL (no generated-client
// coupling, same approach as lib/checklist-templates). R1 extends the original
// create→list→submit→cancel slice with the RESERVATION/MATERIAL discriminator,
// routing + lifecycle columns, and a full 8-action state machine.
// R4 adds hub-stock hard-reserve: confirm/prepare reserves CONSUMABLE KIT_ITEM lines;
// cancel/fulfill from STAGED releases them. Guarded by stockReservedAt idempotency.
// F3 adds mandatory per-line fulfillment checklist: setLineFulfillment, getLineChecklist,
// PENDING_LINES gate on staging, effective-qty/item reserve, and requester notification.

export const LINE_TYPES = ['KIT_ITEM', 'VEHICLE', 'NEW_PURCHASE', 'SHIPPING_LABEL'] as const
export type LineType = (typeof LINE_TYPES)[number]
export const VEHICLE_TYPES = ['TRUCK', 'TRAILER', 'POLARIS_UTV', 'CAN_AM_UTV', 'CHRISTIE_DRILL', 'ATV', 'OTHER'] as const

export const REQUEST_TYPES = ['RESERVATION', 'MATERIAL'] as const
export type RequestType = (typeof REQUEST_TYPES)[number]

export type RequestAction = 'submit' | 'cancel' | 'confirm' | 'prepare' | 'decline' | 'fulfill' | 'forward' | 'complete'

export type LineFulfillmentStatus = 'PENDING' | 'CONFIRMED' | 'EDITED' | 'DENIED'

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
  shipToHubId?: string | null
  shipToAddress?: string | null
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
  | { ok: false; code: 'STATE_MISMATCH' | 'TYPE_MISMATCH' | 'INSUFFICIENT_STOCK' | 'PENDING_LINES'; shortItems?: string[] }

export interface LineFulfillmentInput {
  status: LineFulfillmentStatus
  fulfilledQty?: number | null
  resolvedUnitId?: string | null
  resolvedVehicleId?: string | null
  substitutedItemId?: string | null
  denyReason?: string | null
  stagedCondition?: string | null
  note?: string | null
  actor: { label: string } | { userId: string }
}

export interface AvailableUnit {
  id: string
  serialNumber: string | null
}

export interface SubstitutableItem {
  id: string
  name: string
  availableAtHub: boolean
}

export interface LineChecklistRow {
  id: string
  lineType: string
  categoryId: string | null
  categoryName: string | null
  itemType: string | null
  vehicleType: string | null
  requestedQty: number
  fulfillmentStatus: string
  fulfilledQty: number | null
  specificInventoryItemId: string | null
  specificItemName: string | null
  substitutedItemId: string | null
  substitutedName: string | null
  resolvedUnitId: string | null
  resolvedVehicleId: string | null
  denyReason: string | null
  description: string | null
  specificUnitSerial: string | null
  availableUnits: AvailableUnit[]
  substitutableItems: SubstitutableItem[]
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
  // F3 fulfillment fields
  fulfillmentStatus: string
  fulfilledQty: number | null
  substitutedItemId: string | null
  substitutedName: string | null
  resolvedUnitId: string | null
  resolvedVehicleId: string | null
  denyReason: string | null
  // F2 ship-to fields
  shipToHubId: string | null
  shipToAddress: string | null
  shipToHubName: string | null
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
      WHERE (r."requestedById" = ${requestedById} OR r."fulfillerOperatorId" = ${requestedById})
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
  let lines: LineRow[]
  try {
    lines = await prisma.$queryRaw<LineRow[]>`
      SELECT l."id", l."lineType"::text AS "lineType", l."categoryId", c."name" AS "categoryName",
             l."itemType", l."vehicleType"::text AS "vehicleType", l."requestedQty",
             l."specificInventoryItemId", l."specificInventoryUnitId", l."description", l."reorderUrl",
             ii."name" AS "specificItemName",
             v."name" AS "specificVehicleName",
             iu."serialNumber" AS "specificUnitSerial",
             l."fulfillmentStatus", l."fulfilledQty", l."denyReason",
             l."substitutedItemId", si."name" AS "substitutedName",
             l."resolvedUnitId", l."resolvedVehicleId",
             l."shipToHubId", l."shipToAddress", sh."name" AS "shipToHubName"
      FROM "deployment_request_lines" l
      LEFT JOIN "categories" c ON c."id" = l."categoryId"
      LEFT JOIN "inventory_items" ii ON ii."id" = l."specificInventoryItemId"
      LEFT JOIN "inventory_items" si ON si."id" = l."substitutedItemId"
      LEFT JOIN "vehicles" v ON v."id" = l."specificVehicleId"
      LEFT JOIN "inventory_units" iu ON iu."id" = l."specificInventoryUnitId"
      LEFT JOIN "hubs" sh ON sh."id" = l."shipToHubId"
      WHERE l."requestId" = ${id}
      ORDER BY l."createdAt" ASC
    `
  } catch {
    // Pre-migration DB: fall back to query without F2 columns
    const base = await prisma.$queryRaw<Omit<LineRow, 'shipToHubId' | 'shipToAddress' | 'shipToHubName'>[]>`
      SELECT l."id", l."lineType"::text AS "lineType", l."categoryId", c."name" AS "categoryName",
             l."itemType", l."vehicleType"::text AS "vehicleType", l."requestedQty",
             l."specificInventoryItemId", l."specificInventoryUnitId", l."description", l."reorderUrl",
             ii."name" AS "specificItemName",
             v."name" AS "specificVehicleName",
             iu."serialNumber" AS "specificUnitSerial",
             l."fulfillmentStatus", l."fulfilledQty", l."denyReason",
             l."substitutedItemId", si."name" AS "substitutedName",
             l."resolvedUnitId", l."resolvedVehicleId"
      FROM "deployment_request_lines" l
      LEFT JOIN "categories" c ON c."id" = l."categoryId"
      LEFT JOIN "inventory_items" ii ON ii."id" = l."specificInventoryItemId"
      LEFT JOIN "inventory_items" si ON si."id" = l."substitutedItemId"
      LEFT JOIN "vehicles" v ON v."id" = l."specificVehicleId"
      LEFT JOIN "inventory_units" iu ON iu."id" = l."specificInventoryUnitId"
      WHERE l."requestId" = ${id}
      ORDER BY l."createdAt" ASC
    `
    lines = base.map((l) => ({ ...l, shipToHubId: null, shipToAddress: null, shipToHubName: null }))
  }
  return { request, lines, requestedById: request.requestedById }
}

export async function createRequest(input: CreateRequestInput, requestedById: string): Promise<string> {
  const id = randomUUID()
  const requestType = input.requestType ?? 'RESERVATION'
  // Track lineId → ship-to for best-effort post-insert update (F2 columns are
  // additive; the try/catch keeps this deploy-safe against a pre-migration DB).
  const lineShipTo: { lineId: string; shipToHubId: string | null; shipToAddress: string | null }[] = []

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
      const lineId = randomUUID()
      lineShipTo.push({ lineId, shipToHubId: line.shipToHubId ?? null, shipToAddress: line.shipToAddress ?? null })
      await tx.$executeRaw`
        INSERT INTO "deployment_request_lines"
          ("id", "requestId", "lineType", "categoryId", "itemType", "vehicleType", "requestedQty",
           "specificInventoryItemId", "specificVehicleId",
           "specificInventoryUnitId", "description", "reorderUrl")
        VALUES (${lineId}, ${id}, ${line.lineType}::"RequestLineType",
                ${line.categoryId ?? null}, ${line.itemType ?? null},
                ${line.vehicleType ?? null}::"VehicleType",
                ${Math.max(1, Math.floor(line.requestedQty || 1))},
                ${line.specificInventoryItemId ?? null}, ${line.specificVehicleId ?? null},
                ${line.specificInventoryUnitId ?? null}, ${line.description ?? null}, ${line.reorderUrl ?? null})
      `
    }
  })

  // F2: persist ship-to fields after the transaction (deploy-safe — pre-migration DB ignores silently).
  for (const { lineId, shipToHubId, shipToAddress } of lineShipTo) {
    if (shipToHubId !== null || shipToAddress !== null) {
      await prisma.$executeRaw`
        UPDATE "deployment_request_lines"
        SET "shipToHubId" = ${shipToHubId}, "shipToAddress" = ${shipToAddress}
        WHERE "id" = ${lineId}
      `.catch(() => {})
    }
  }

  return id
}

// ── F3: Per-line fulfillment ───────────────────────────────────────────────────

/**
 * Confirm, edit, or deny one line. Appends a request_line_events row (from→to).
 * Rejects if the parent request is no longer REQUESTED (lines are locked once staged).
 * CONFIRM sets fulfilledQty = requestedQty; SERIALIZED items require resolvedUnitId.
 */
export async function setLineFulfillment(
  lineId: string,
  input: LineFulfillmentInput,
): Promise<{ ok: boolean; error?: string }> {
  const lineRows = await prisma.$queryRaw<{
    id: string
    requestId: string
    requestStatus: string
    fulfillmentStatus: string
    requestedQty: number
    specificInventoryItemId: string | null
    itemType: string | null
    fulfilledQty: number | null
    substitutedItemId: string | null
  }[]>`
    SELECT l."id", l."requestId", r."status"::text AS "requestStatus",
           l."fulfillmentStatus", l."requestedQty",
           l."specificInventoryItemId", ii."itemType",
           l."fulfilledQty", l."substitutedItemId"
    FROM "deployment_request_lines" l
    JOIN "deployment_requests" r ON r."id" = l."requestId"
    LEFT JOIN "inventory_items" ii ON ii."id" = l."specificInventoryItemId"
    WHERE l."id" = ${lineId}
  `
  const line = lineRows[0]
  if (!line) return { ok: false, error: 'Line not found.' }
  if (line.requestStatus !== 'REQUESTED') {
    return { ok: false, error: 'Request cannot be modified in the current state.' }
  }

  if (input.status === 'CONFIRMED' && line.itemType === 'SERIALIZED' && !input.resolvedUnitId) {
    return { ok: false, error: 'A unit must be assigned to confirm a serialized item.' }
  }

  // CONFIRM fills fulfilledQty = requestedQty; EDIT uses the supplied qty; DENY clears it.
  const effectiveQty: number | null =
    input.status === 'DENIED'
      ? null
      : input.status === 'CONFIRMED'
        ? (input.fulfilledQty ?? line.requestedQty)
        : (input.fulfilledQty ?? null)

  const fromQty = line.fulfilledQty ?? line.requestedQty
  const fromItemId = line.substitutedItemId ?? line.specificInventoryItemId
  const toQty = effectiveQty
  const toItemId = input.substitutedItemId ?? line.specificInventoryItemId

  const actorLabel = 'label' in input.actor ? input.actor.label : null
  const actorUserId = 'userId' in input.actor ? input.actor.userId : null
  const actionName =
    input.status === 'CONFIRMED' ? 'CONFIRM' : input.status === 'EDITED' ? 'EDIT' : 'DENY'

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "deployment_request_lines"
      SET "fulfillmentStatus" = ${input.status},
          "fulfilledQty"      = ${effectiveQty ?? null},
          "resolvedUnitId"    = ${input.resolvedUnitId ?? null},
          "resolvedVehicleId" = ${input.resolvedVehicleId ?? null},
          "substitutedItemId" = ${input.substitutedItemId ?? null},
          "denyReason"        = ${input.denyReason ?? null},
          "stagedCondition"   = ${input.stagedCondition ?? null}
      WHERE "id" = ${lineId}
    `
    await tx.$executeRaw`
      INSERT INTO "request_line_events"
        ("id", "lineId", "requestId", "action",
         "fromQty", "toQty", "fromItemId", "toItemId",
         "note", "actorLabel", "actorUserId", "createdAt")
      VALUES (${randomUUID()}, ${lineId}, ${line.requestId}, ${actionName},
              ${fromQty}, ${toQty ?? null}, ${fromItemId ?? null}, ${toItemId ?? null},
              ${input.note ?? null}, ${actorLabel}, ${actorUserId}, now())
    `
  })

  return { ok: true }
}

/**
 * Full checklist for a request: every line with current fulfillment state,
 * available serialized units at the hub, substitutable consumable items,
 * and a progress count.
 */
export async function getLineChecklist(
  requestId: string,
  fulfillerHubId?: string | null,
): Promise<{ lines: LineChecklistRow[]; progress: { checked: number; total: number } }> {
  const baseLines = await prisma.$queryRaw<Omit<LineChecklistRow, 'availableUnits' | 'substitutableItems'>[]>`
    SELECT l."id", l."lineType"::text AS "lineType", l."categoryId", c."name" AS "categoryName",
           l."itemType", l."vehicleType"::text AS "vehicleType", l."requestedQty",
           l."fulfillmentStatus", l."fulfilledQty", l."denyReason",
           l."specificInventoryItemId", ii."name" AS "specificItemName",
           l."substitutedItemId", si."name" AS "substitutedName",
           l."resolvedUnitId", l."resolvedVehicleId",
           l."description",
           ru."serialNumber" AS "specificUnitSerial"
    FROM "deployment_request_lines" l
    LEFT JOIN "categories" c ON c."id" = l."categoryId"
    LEFT JOIN "inventory_items" ii ON ii."id" = l."specificInventoryItemId"
    LEFT JOIN "inventory_items" si ON si."id" = l."substitutedItemId"
    LEFT JOIN "inventory_units" ru ON ru."id" = l."resolvedUnitId"
    WHERE l."requestId" = ${requestId}
    ORDER BY l."createdAt" ASC
  `

  // Available serialized units for SERIALIZED lines
  const serialItemIds = baseLines
    .filter((l) => l.itemType === 'SERIALIZED' && l.specificInventoryItemId)
    .map((l) => l.specificInventoryItemId!)

  const availableUnitsMap = new Map<string, AvailableUnit[]>()
  if (serialItemIds.length > 0) {
    const units = await prisma.$queryRaw<(AvailableUnit & { itemId: string })[]>`
      SELECT u."id", u."serialNumber", u."inventoryItemId" AS "itemId"
      FROM "inventory_units" u
      WHERE u."inventoryItemId" IN (${Prisma.join(serialItemIds)})
        AND u."status" = 'AVAILABLE'
      ORDER BY u."serialNumber" ASC NULLS LAST
    `
    for (const u of units) {
      const list = availableUnitsMap.get(u.itemId) ?? []
      list.push({ id: u.id, serialNumber: u.serialNumber })
      availableUnitsMap.set(u.itemId, list)
    }
  }

  // Substitutable items: same category, CONSUMABLE, different item
  const substitutableMap = new Map<string, SubstitutableItem[]>()
  const consumableLineIds = baseLines
    .filter((l) => l.itemType === 'CONSUMABLE' && l.specificInventoryItemId)
    .map((l) => l.id)

  if (consumableLineIds.length > 0) {
    type SubRow = { lineId: string; id: string; name: string; availableAtHub: boolean }
    let subRows: SubRow[]
    if (fulfillerHubId) {
      subRows = await prisma.$queryRaw<SubRow[]>`
        SELECT l."id" AS "lineId", sub."id", sub."name",
               COALESCE((s."quantity" - s."reservedQty") > 0, false) AS "availableAtHub"
        FROM "deployment_request_lines" l
        JOIN "inventory_items" orig ON orig."id" = l."specificInventoryItemId"
        JOIN "inventory_items" sub ON sub."categoryId" = orig."categoryId"
          AND sub."id" != l."specificInventoryItemId"
          AND sub."itemType" = 'CONSUMABLE'
        LEFT JOIN "inventory_stock" s ON s."itemId" = sub."id" AND s."hubId" = ${fulfillerHubId}
        WHERE l."id" IN (${Prisma.join(consumableLineIds)})
        ORDER BY l."id", sub."name"
        LIMIT 200
      `
    } else {
      subRows = await prisma.$queryRaw<SubRow[]>`
        SELECT l."id" AS "lineId", sub."id", sub."name", false AS "availableAtHub"
        FROM "deployment_request_lines" l
        JOIN "inventory_items" orig ON orig."id" = l."specificInventoryItemId"
        JOIN "inventory_items" sub ON sub."categoryId" = orig."categoryId"
          AND sub."id" != l."specificInventoryItemId"
          AND sub."itemType" = 'CONSUMABLE'
        WHERE l."id" IN (${Prisma.join(consumableLineIds)})
        ORDER BY l."id", sub."name"
        LIMIT 200
      `
    }
    for (const r of subRows) {
      const list = substitutableMap.get(r.lineId) ?? []
      list.push({ id: r.id, name: r.name, availableAtHub: r.availableAtHub as unknown as boolean })
      substitutableMap.set(r.lineId, list)
    }
  }

  const lines: LineChecklistRow[] = baseLines.map((l) => ({
    ...l,
    availableUnits:
      l.itemType === 'SERIALIZED' && l.specificInventoryItemId
        ? (availableUnitsMap.get(l.specificInventoryItemId) ?? [])
        : [],
    substitutableItems: substitutableMap.get(l.id) ?? [],
  }))

  const total = lines.length
  const checked = lines.filter((l) => l.fulfillmentStatus !== 'PENDING').length

  return { lines, progress: { checked, total } }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

type RawTx = Pick<typeof prisma, '$executeRaw' | '$queryRaw'>

interface EffectiveLine {
  effectiveItemId: string
  effectiveQty: number
  itemName: string | null
}

/**
 * The set of lines that need stock reserved (or released): CONFIRMED/EDITED
 * CONSUMABLE KIT_ITEM lines, using effective item (substituted ?? original)
 * and effective qty (fulfilledQty ?? requestedQty).
 * Shared by the stage reserve and the release-on-cancel/fulfill paths so the
 * accounting never drifts.
 */
async function effectiveReserveLines(requestId: string, tx: RawTx): Promise<EffectiveLine[]> {
  const rows = await tx.$queryRaw<{
    effectiveItemId: string
    effectiveQty: bigint | number
    itemName: string | null
    effectiveItemType: string | null
  }[]>`
    SELECT
      COALESCE(l."substitutedItemId", l."specificInventoryItemId") AS "effectiveItemId",
      COALESCE(l."fulfilledQty", l."requestedQty") AS "effectiveQty",
      COALESCE(si."name", ii."name") AS "itemName",
      COALESCE(si."itemType", ii."itemType") AS "effectiveItemType"
    FROM "deployment_request_lines" l
    JOIN "inventory_items" ii ON ii."id" = l."specificInventoryItemId"
    LEFT JOIN "inventory_items" si ON si."id" = l."substitutedItemId"
    WHERE l."requestId" = ${requestId}
      AND l."lineType" = 'KIT_ITEM'
      AND l."specificInventoryItemId" IS NOT NULL
      AND ii."itemType" = 'CONSUMABLE'
      AND l."fulfillmentStatus" IN ('CONFIRMED', 'EDITED')
  `
  return rows
    .filter((r) => r.effectiveItemType === 'CONSUMABLE')
    .map((r) => ({
      effectiveItemId: r.effectiveItemId,
      effectiveQty: Number(r.effectiveQty),
      itemName: r.itemName,
    }))
}

/** Release all reserved consumable stock for a request if stockReservedAt is set. */
async function releaseReservedStock(requestId: string, tx: RawTx): Promise<void> {
  const reqRows = await tx.$queryRaw<{ stockReservedAt: Date | null; fulfillerHubId: string | null }[]>`
    SELECT "stockReservedAt", "fulfillerHubId" FROM "deployment_requests" WHERE "id" = ${requestId}
  `
  const req = reqRows[0]
  if (!req?.stockReservedAt || !req?.fulfillerHubId) return

  const lines = await effectiveReserveLines(requestId, tx)
  for (const line of lines) {
    await releaseAtHub(line.effectiveItemId, req.fulfillerHubId, line.effectiveQty, tx)
  }
}

// ── State machine ─────────────────────────────────────────────────────────────

/**
 * Apply a state-machine transition. Returns a structured result so callers can
 * distinguish state mismatches from insufficient-stock failures (R4) and
 * incomplete checklists (F3 PENDING_LINES).
 *
 * Actions and their guards:
 *   submit   — both types:        DRAFT → REQUESTED
 *   cancel   — RESERVATION:       {DRAFT,REQUESTED,STAGED} → CANCELLED (releases stock if STAGED)
 *              MATERIAL:           {DRAFT,REQUESTED,FORWARDED} → CANCELLED
 *   confirm  — RESERVATION only:  REQUESTED → STAGED
 *              F3 gate: all lines must be CONFIRMED/EDITED/DENIED (no PENDING)
 *              reserves CONSUMABLE KIT_ITEM lines using effectiveQty + effectiveItem
 *              notifies requester with diff summary
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
          // F3 gate: all lines must be checked (no PENDING) before staging.
          const pendingRows = await tx.$queryRaw<{ cnt: bigint }[]>`
            SELECT COUNT(*)::bigint AS cnt
            FROM "deployment_request_lines"
            WHERE "requestId" = ${id} AND "fulfillmentStatus" = 'PENDING'
          `
          if (Number(pendingRows[0]?.cnt ?? 0) > 0) {
            throw Object.assign(new Error('PENDING_LINES'), { _code: 'PENDING_LINES' })
          }

          // Idempotency guard: flip status + stamp stockReservedAt atomically.
          const n = await tx.$executeRaw`
            UPDATE "deployment_requests"
            SET "status" = 'STAGED', "updatedAt" = now(), "decidedAt" = now(),
                "decisionNote" = ${extra?.decisionNote ?? null},
                "stockReservedAt" = now()
            WHERE "id" = ${id} AND "status" = 'REQUESTED' AND "stockReservedAt" IS NULL
          `
          if (Number(n) === 0) throw Object.assign(new Error('STATE_MISMATCH'), { _code: 'STATE_MISMATCH' })

          // Resolve fulfillerHubId for reserve + notification fetch.
          const reqRows = await tx.$queryRaw<{ fulfillerHubId: string | null; requestedById: string }[]>`
            SELECT "fulfillerHubId", "requestedById" FROM "deployment_requests" WHERE "id" = ${id}
          `
          const { fulfillerHubId, requestedById } = reqRows[0] ?? {}
          const hubId = fulfillerHubId ?? extra?.fulfillerHubId ?? null

          if (hubId) {
            // Reserve effective consumable lines (CONFIRMED/EDITED, effective item + qty).
            const lines = await effectiveReserveLines(id, tx)
            const shortItems: string[] = []
            for (const line of lines) {
              const reserved = await reserveAtHub(line.effectiveItemId, hubId, line.effectiveQty, tx)
              if (!reserved) shortItems.push(line.itemName ?? line.effectiveItemId)
            }
            if (shortItems.length > 0) {
              throw Object.assign(new Error('INSUFFICIENT_STOCK'), {
                _code: 'INSUFFICIENT_STOCK',
                _shortItems: shortItems,
              })
            }
          }

          // Notify requester with diff summary (atomic with the stage).
          if (requestedById) {
            const diffRows = await tx.$queryRaw<{ adjustedCount: bigint; deniedCount: bigint }[]>`
              SELECT
                COUNT(*) FILTER (WHERE "fulfillmentStatus" = 'EDITED') AS "adjustedCount",
                COUNT(*) FILTER (WHERE "fulfillmentStatus" = 'DENIED') AS "deniedCount"
              FROM "deployment_request_lines"
              WHERE "requestId" = ${id}
            `
            const adjusted = Number(diffRows[0]?.adjustedCount ?? 0)
            const denied = Number(diffRows[0]?.deniedCount ?? 0)
            const parts: string[] = []
            if (adjusted > 0) parts.push(`${adjusted} item${adjusted !== 1 ? 's' : ''} adjusted`)
            if (denied > 0) parts.push(`${denied} denied`)
            const body =
              parts.length > 0
                ? `Your reservation was prepared: ${parts.join(', ')} — review`
                : 'Your rig reservation has been staged by the hub.'

            await (tx as typeof prisma).notification.create({
              data: {
                userId: requestedById,
                type: 'RESERVATION_UPDATE',
                title: 'Reservation staged',
                body,
                link: '/operator/requests',
              },
            })
          }

          return { ok: true } as TransitionResult
        })
      } catch (err: unknown) {
        const e = err as { _code?: string; _shortItems?: string[] }
        if (e._code === 'STATE_MISMATCH') return { ok: false, code: 'STATE_MISMATCH' }
        if (e._code === 'PENDING_LINES') return { ok: false, code: 'PENDING_LINES' }
        if (e._code === 'INSUFFICIENT_STOCK')
          return { ok: false, code: 'INSUFFICIENT_STOCK', shortItems: e._shortItems ?? [] }
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
