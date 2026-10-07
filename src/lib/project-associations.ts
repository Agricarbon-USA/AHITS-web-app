import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export interface ProjectRef { id: string; name: string }

export async function getActiveProjectsForVehicles(
  vehicleIds: string[],
): Promise<Map<string, ProjectRef[]>> {
  const map = new Map<string, ProjectRef[]>()
  if (vehicleIds.length === 0) return map
  for (const id of vehicleIds) map.set(id, [])

  const rows = await prisma.$queryRaw<{ vehicleId: string; projectId: string; name: string }[]>`
    SELECT rv."vehicleId", dp."projectId", p."name"
    FROM "rig_vehicles" rv
    JOIN "rigs" r ON r."id" = rv."rigId" AND r."endedAt" IS NULL
    JOIN "deployment_projects" dp ON dp."rigId" = r."id" AND dp."removedAt" IS NULL
    JOIN "projects" p ON p."id" = dp."projectId"
    WHERE rv."vehicleId" IN (${Prisma.join(vehicleIds)})
      AND rv."removedAt" IS NULL
  `
  for (const row of rows) {
    const list = map.get(row.vehicleId)!
    if (!list.some((p) => p.id === row.projectId)) list.push({ id: row.projectId, name: row.name })
  }
  return map
}

export async function getActiveProjectsForOperators(
  operatorIds: string[],
): Promise<Map<string, ProjectRef[]>> {
  const map = new Map<string, ProjectRef[]>()
  if (operatorIds.length === 0) return map
  for (const id of operatorIds) map.set(id, [])

  const rows = await prisma.$queryRaw<{ operatorId: string; projectId: string; name: string }[]>`
    SELECT da."operatorId", dp."projectId", p."name"
    FROM "deployment_assignments" da
    JOIN "deployment_projects" dp ON dp."rigId" = da."rigId" AND dp."removedAt" IS NULL
    JOIN "projects" p ON p."id" = dp."projectId"
    WHERE da."operatorId" IN (${Prisma.join(operatorIds)})
      AND da."endedAt" IS NULL
  `
  for (const row of rows) {
    const list = map.get(row.operatorId)!
    if (!list.some((p) => p.id === row.projectId)) list.push({ id: row.projectId, name: row.name })
  }
  return map
}

/**
 * PR-2 (C-12): active deployments per project, through `deployment_projects`
 * (a deployment can carry several projects), not the legacy `rigs.projectId`
 * column, which counted ended rigs and only one project per rig.
 */
export async function countActiveDeploymentsForProjects(
  projectIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (projectIds.length === 0) return map
  for (const id of projectIds) map.set(id, 0)

  const rows = await prisma.$queryRaw<{ projectId: string; n: bigint | number }[]>`
    SELECT dp."projectId", COUNT(DISTINCT r."id") AS "n"
    FROM "deployment_projects" dp
    JOIN "rigs" r ON r."id" = dp."rigId" AND r."endedAt" IS NULL
    WHERE dp."projectId" IN (${Prisma.join(projectIds)})
      AND dp."removedAt" IS NULL
    GROUP BY dp."projectId"
  `
  for (const row of rows) map.set(row.projectId, Number(row.n))
  return map
}

export async function getActiveProjectsForItems(
  itemIds: string[],
): Promise<Map<string, ProjectRef[]>> {
  const map = new Map<string, ProjectRef[]>()
  if (itemIds.length === 0) return map
  for (const id of itemIds) map.set(id, [])

  const rows = await prisma.$queryRaw<{ inventoryItemId: string; projectId: string; name: string }[]>`
    SELECT ki."inventoryItemId", dp."projectId", p."name"
    FROM "kit_items" ki
    JOIN "kits" k ON k."id" = ki."kitId"
    JOIN "rigs" r ON r."id" = k."rigId" AND r."endedAt" IS NULL
    JOIN "deployment_projects" dp ON dp."rigId" = r."id" AND dp."removedAt" IS NULL
    JOIN "projects" p ON p."id" = dp."projectId"
    WHERE ki."inventoryItemId" IN (${Prisma.join(itemIds)})
      AND ki."removedAt" IS NULL
  `
  for (const row of rows) {
    const list = map.get(row.inventoryItemId)!
    if (!list.some((p) => p.id === row.projectId)) list.push({ id: row.projectId, name: row.name })
  }
  return map
}
