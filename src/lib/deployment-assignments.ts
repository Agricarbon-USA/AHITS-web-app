import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

type RawClient = Pick<typeof prisma, '$executeRaw' | '$queryRaw'>

export const ASSIGNMENT_ROLES = ['PRIMARY', 'SECONDARY'] as const
export type AssignmentRole = (typeof ASSIGNMENT_ROLES)[number]

export interface DeploymentProjectRow {
  id: string
  rigId: string
  projectId: string
  projectName: string | null
  addedAt: Date
  removedAt: Date | null
}

export interface DeploymentAssignmentRow {
  id: string
  rigId: string
  operatorId: string
  operatorName: string | null
  role: AssignmentRole
  startedAt: Date
  endedAt: Date | null
  addedById: string | null
  note: string | null
}

/** Current operator + project roster for one or more deployments, sourced from the new tables. */
export interface DeploymentRoster {
  operator: { id: string; name: string; email: string } | null
  operatorId: string | null
  secondaryOperators: { operator: { id: string; name: string; email: string } }[]
  projects: { id: string; name: string }[]
}

export async function getDeploymentRosters(
  rigIds: string[],
  db: RawClient = prisma,
): Promise<Map<string, DeploymentRoster>> {
  const map = new Map<string, DeploymentRoster>()
  if (rigIds.length === 0) return map
  for (const id of rigIds) {
    map.set(id, { operator: null, operatorId: null, secondaryOperators: [], projects: [] })
  }

  const assignments = await db.$queryRaw<
    { rigId: string; operatorId: string; name: string | null; email: string | null; role: string }[]
  >`
    SELECT a."rigId", a."operatorId", u."name", u."email", a."role"::text AS "role"
    FROM "deployment_assignments" a
    LEFT JOIN "users" u ON u."id" = a."operatorId"
    WHERE a."rigId" IN (${Prisma.join(rigIds)}) AND a."endedAt" IS NULL
  `
  for (const a of assignments) {
    const r = map.get(a.rigId)
    if (!r) continue
    if (a.role === 'PRIMARY') {
      r.operator = { id: a.operatorId, name: a.name ?? '', email: a.email ?? '' }
      r.operatorId = a.operatorId
    } else {
      r.secondaryOperators.push({ operator: { id: a.operatorId, name: a.name ?? '', email: a.email ?? '' } })
    }
  }

  const projectRows = await db.$queryRaw<
    { rigId: string; projectId: string; name: string | null }[]
  >`
    SELECT dp."rigId", dp."projectId", p."name"
    FROM "deployment_projects" dp
    LEFT JOIN "projects" p ON p."id" = dp."projectId"
    WHERE dp."rigId" IN (${Prisma.join(rigIds)}) AND dp."removedAt" IS NULL
  `
  for (const p of projectRows) {
    const r = map.get(p.rigId)
    if (!r) continue
    r.projects.push({ id: p.projectId, name: p.name ?? '' })
  }

  return map
}

export async function getDeploymentRoster(
  rigId: string,
  db: RawClient = prisma,
): Promise<DeploymentRoster> {
  const map = await getDeploymentRosters([rigId], db)
  return map.get(rigId) ?? { operator: null, operatorId: null, secondaryOperators: [], projects: [] }
}

/** All (active + historical) project links for a deployment, newest first. */
export async function listDeploymentProjects(rigId: string): Promise<DeploymentProjectRow[]> {
  return prisma.$queryRaw<DeploymentProjectRow[]>`
    SELECT dp."id", dp."rigId", dp."projectId", p."name" AS "projectName",
           dp."addedAt", dp."removedAt"
    FROM "deployment_projects" dp
    LEFT JOIN "projects" p ON p."id" = dp."projectId"
    WHERE dp."rigId" = ${rigId}
    ORDER BY dp."addedAt" DESC
  `
}

/** Currently-active deployments for a project (link not yet removed). */
export async function listProjectDeployments(projectId: string): Promise<DeploymentProjectRow[]> {
  return prisma.$queryRaw<DeploymentProjectRow[]>`
    SELECT dp."id", dp."rigId", dp."projectId", p."name" AS "projectName",
           dp."addedAt", dp."removedAt"
    FROM "deployment_projects" dp
    LEFT JOIN "projects" p ON p."id" = dp."projectId"
    WHERE dp."projectId" = ${projectId} AND dp."removedAt" IS NULL
    ORDER BY dp."addedAt" DESC
  `
}

/** Link a project to a deployment (idempotent on the unique (rigId, projectId)). */
export async function addProjectLink(rigId: string, projectId: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "deployment_projects" ("id", "rigId", "projectId")
    VALUES (${randomUUID()}, ${rigId}, ${projectId})
    ON CONFLICT ("rigId", "projectId")
    DO UPDATE SET "removedAt" = NULL
  `
}

/** Soft-close a project link (sets removedAt). Returns true if a row changed. */
export async function removeProjectLink(rigId: string, projectId: string): Promise<boolean> {
  const n = await prisma.$executeRaw`
    UPDATE "deployment_projects" SET "removedAt" = now()
    WHERE "rigId" = ${rigId} AND "projectId" = ${projectId} AND "removedAt" IS NULL
  `
  return Number(n) > 0
}

/** All (active + historical) operator assignments for a deployment, newest first. */
export async function listAssignments(rigId: string): Promise<DeploymentAssignmentRow[]> {
  return prisma.$queryRaw<DeploymentAssignmentRow[]>`
    SELECT a."id", a."rigId", a."operatorId", u."name" AS "operatorName",
           a."role"::text AS "role", a."startedAt", a."endedAt", a."addedById", a."note"
    FROM "deployment_assignments" a
    LEFT JOIN "users" u ON u."id" = a."operatorId"
    WHERE a."rigId" = ${rigId}
    ORDER BY a."startedAt" DESC
  `
}

/** The current PRIMARY assignment for an operator (un-ended), if any. */
export async function getActivePrimary(operatorId: string): Promise<DeploymentAssignmentRow | null> {
  const rows = await prisma.$queryRaw<DeploymentAssignmentRow[]>`
    SELECT a."id", a."rigId", a."operatorId", u."name" AS "operatorName",
           a."role"::text AS "role", a."startedAt", a."endedAt", a."addedById", a."note"
    FROM "deployment_assignments" a
    LEFT JOIN "users" u ON u."id" = a."operatorId"
    WHERE a."operatorId" = ${operatorId} AND a."role" = 'PRIMARY' AND a."endedAt" IS NULL
    ORDER BY a."startedAt" DESC
    LIMIT 1
  `
  return rows[0] ?? null
}

/** Open a new operator assignment on a deployment. */
export async function addAssignment(input: {
  rigId: string
  operatorId: string
  role: AssignmentRole
  addedById?: string | null
  note?: string | null
}): Promise<string> {
  const id = randomUUID()
  await prisma.$executeRaw`
    INSERT INTO "deployment_assignments" ("id", "rigId", "operatorId", "role", "addedById", "note")
    VALUES (${id}, ${input.rigId}, ${input.operatorId},
            ${input.role}::"DeploymentAssignmentRole", ${input.addedById ?? null}, ${input.note ?? null})
  `
  return id
}

/** End an operator's open assignment on a deployment. Returns true if one changed. */
export async function endAssignment(rigId: string, operatorId: string): Promise<boolean> {
  const n = await prisma.$executeRaw`
    UPDATE "deployment_assignments" SET "endedAt" = now()
    WHERE "rigId" = ${rigId} AND "operatorId" = ${operatorId} AND "endedAt" IS NULL
  `
  return Number(n) > 0
}
