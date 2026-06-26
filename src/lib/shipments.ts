import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'

// F2: Shipment data-access layer (Shippo groundwork).
// Raw SQL only — no generated-client coupling. All functions are dormant in this
// slice (imported by nothing live) so adding them is regression-safe.
// NO Shippo HTTP calls, NO env/secret access — this is schema + stub only.

export type ShipmentStatus = 'UNKNOWN' | 'PRE_TRANSIT' | 'TRANSIT' | 'DELIVERED' | 'RETURNED' | 'FAILURE'

export interface ShipmentRow {
  id: string
  carrier: string | null
  trackingNumber: string | null
  status: ShipmentStatus
  labelUrl: string | null
  estimatedDelivery: Date | null
  maintenanceTaskId: string | null
  inventoryUnitId: string | null
  deploymentRequestLineId: string | null
  hubId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateShipmentInput {
  carrier?: string | null
  trackingNumber?: string | null
  status?: ShipmentStatus
  labelUrl?: string | null
  estimatedDelivery?: Date | null
  maintenanceTaskId?: string | null
  inventoryUnitId?: string | null
  deploymentRequestLineId?: string | null
  hubId?: string | null
}

export async function createShipment(input: CreateShipmentInput): Promise<ShipmentRow> {
  const id = randomUUID()
  const status = input.status ?? 'UNKNOWN'
  await prisma.$executeRaw`
    INSERT INTO "shipments"
      ("id", "carrier", "trackingNumber", "status", "labelUrl", "estimatedDelivery",
       "maintenanceTaskId", "inventoryUnitId", "deploymentRequestLineId", "hubId")
    VALUES (${id}, ${input.carrier ?? null}, ${input.trackingNumber ?? null},
            ${status}::"ShipmentStatus",
            ${input.labelUrl ?? null}, ${input.estimatedDelivery ?? null},
            ${input.maintenanceTaskId ?? null}, ${input.inventoryUnitId ?? null},
            ${input.deploymentRequestLineId ?? null}, ${input.hubId ?? null})
  `
  const rows = await prisma.$queryRaw<ShipmentRow[]>`SELECT * FROM "shipments" WHERE "id" = ${id}`
  return rows[0]!
}

export async function getShipment(id: string): Promise<ShipmentRow | null> {
  const rows = await prisma.$queryRaw<ShipmentRow[]>`SELECT * FROM "shipments" WHERE "id" = ${id}`
  return rows[0] ?? null
}

export async function listShipmentsForSubject(subject: {
  maintenanceTaskId?: string
  inventoryUnitId?: string
  deploymentRequestLineId?: string
  hubId?: string
}): Promise<ShipmentRow[]> {
  const { maintenanceTaskId, inventoryUnitId, deploymentRequestLineId, hubId } = subject
  if (maintenanceTaskId) {
    return prisma.$queryRaw<ShipmentRow[]>`
      SELECT * FROM "shipments" WHERE "maintenanceTaskId" = ${maintenanceTaskId} ORDER BY "createdAt" DESC
    `
  }
  if (inventoryUnitId) {
    return prisma.$queryRaw<ShipmentRow[]>`
      SELECT * FROM "shipments" WHERE "inventoryUnitId" = ${inventoryUnitId} ORDER BY "createdAt" DESC
    `
  }
  if (deploymentRequestLineId) {
    return prisma.$queryRaw<ShipmentRow[]>`
      SELECT * FROM "shipments" WHERE "deploymentRequestLineId" = ${deploymentRequestLineId} ORDER BY "createdAt" DESC
    `
  }
  if (hubId) {
    return prisma.$queryRaw<ShipmentRow[]>`
      SELECT * FROM "shipments" WHERE "hubId" = ${hubId} ORDER BY "createdAt" DESC
    `
  }
  return []
}

export async function updateShipmentStatus(id: string, status: ShipmentStatus): Promise<{ ok: boolean }> {
  const n = await prisma.$executeRaw`
    UPDATE "shipments"
    SET "status" = ${status}::"ShipmentStatus", "updatedAt" = now()
    WHERE "id" = ${id}
  `
  return { ok: Number(n) > 0 }
}
