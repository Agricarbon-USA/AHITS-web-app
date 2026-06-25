import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'

// M5 item 25: admin-configurable daily-check checklists. Read/written via raw
// SQL so it needs no generated-client coupling (same approach as
// lib/notification-config.ts). A template's items override the built-in
// DEFAULT_DAILY_CHECKLIST for vehicles of a given type; vehicleType null = a
// general override for all types.

export interface ChecklistTemplateItem {
  key: string
  label: string
}

export interface ChecklistTemplate {
  id: string
  name: string
  vehicleType: string | null
  items: ChecklistTemplateItem[]
  isActive: boolean
}

// The seven VehicleType enum values; a template's vehicleType must be one of
// these or null. Guards the raw-SQL cast against an invalid enum literal.
export const VEHICLE_TYPES = [
  'TRUCK', 'TRAILER', 'POLARIS_UTV', 'CAN_AM_UTV', 'CHRISTIE_DRILL', 'ATV', 'OTHER',
] as const
export type VehicleTypeValue = (typeof VEHICLE_TYPES)[number]

interface Row {
  id: string
  name: string
  vehicleType: string | null
  itemsJson: unknown
  isActive: boolean
}

function normalizeItems(raw: unknown): ChecklistTemplateItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((i): i is { key: unknown; label: unknown } => !!i && typeof i === 'object')
    .map((i) => ({ key: String((i as { key: unknown }).key ?? ''), label: String((i as { label: unknown }).label ?? '') }))
    .filter((i) => i.key && i.label)
}

function toTemplate(r: Row): ChecklistTemplate {
  return { id: r.id, name: r.name, vehicleType: r.vehicleType, items: normalizeItems(r.itemsJson), isActive: r.isActive }
}

/** All templates, newest first. Empty list if the table is missing (pre-migration). */
export async function listChecklistTemplates(): Promise<ChecklistTemplate[]> {
  try {
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT "id", "name", "vehicleType"::text AS "vehicleType", "itemsJson", "isActive"
      FROM "checklist_templates"
      ORDER BY "isActive" DESC, "vehicleType" ASC NULLS LAST, "updatedAt" DESC
    `
    return rows.map(toTemplate)
  } catch {
    return []
  }
}

/**
 * Resolve the checklist items for a vehicle of the given type: the active
 * type-specific template, else an active general (null-type) template, else
 * null so the caller falls back to DEFAULT_DAILY_CHECKLIST. Never throws.
 */
export async function resolveChecklistItems(vehicleType: string | null): Promise<ChecklistTemplateItem[] | null> {
  if (!vehicleType || !VEHICLE_TYPES.includes(vehicleType as VehicleTypeValue)) return resolveGeneral()
  try {
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT "id", "name", "vehicleType"::text AS "vehicleType", "itemsJson", "isActive"
      FROM "checklist_templates"
      WHERE "isActive" = true AND "vehicleType" = ${vehicleType}::"VehicleType"
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `
    if (rows[0]) {
      const items = normalizeItems(rows[0].itemsJson)
      if (items.length) return items
    }
    return resolveGeneral()
  } catch {
    return null
  }
}

async function resolveGeneral(): Promise<ChecklistTemplateItem[] | null> {
  try {
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT "itemsJson"
      FROM "checklist_templates"
      WHERE "isActive" = true AND "vehicleType" IS NULL
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `
    if (rows[0]) {
      const items = normalizeItems(rows[0].itemsJson)
      if (items.length) return items
    }
    return null
  } catch {
    return null
  }
}

export async function createChecklistTemplate(input: {
  name: string
  vehicleType: string | null
  items: ChecklistTemplateItem[]
}): Promise<string> {
  const id = randomUUID()
  const vt = input.vehicleType
  const itemsJson = JSON.stringify(input.items)
  if (vt) {
    await prisma.$executeRaw`
      INSERT INTO "checklist_templates" ("id", "name", "vehicleType", "itemsJson")
      VALUES (${id}, ${input.name}, ${vt}::"VehicleType", ${itemsJson}::jsonb)
    `
  } else {
    await prisma.$executeRaw`
      INSERT INTO "checklist_templates" ("id", "name", "vehicleType", "itemsJson")
      VALUES (${id}, ${input.name}, NULL, ${itemsJson}::jsonb)
    `
  }
  return id
}

export async function updateChecklistTemplate(id: string, input: {
  name: string
  vehicleType: string | null
  items: ChecklistTemplateItem[]
  isActive: boolean
}): Promise<void> {
  const itemsJson = JSON.stringify(input.items)
  if (input.vehicleType) {
    await prisma.$executeRaw`
      UPDATE "checklist_templates"
      SET "name" = ${input.name}, "vehicleType" = ${input.vehicleType}::"VehicleType",
          "itemsJson" = ${itemsJson}::jsonb, "isActive" = ${input.isActive}, "updatedAt" = now()
      WHERE "id" = ${id}
    `
  } else {
    await prisma.$executeRaw`
      UPDATE "checklist_templates"
      SET "name" = ${input.name}, "vehicleType" = NULL,
          "itemsJson" = ${itemsJson}::jsonb, "isActive" = ${input.isActive}, "updatedAt" = now()
      WHERE "id" = ${id}
    `
  }
}

export async function deleteChecklistTemplate(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "checklist_templates" WHERE "id" = ${id}`
}
