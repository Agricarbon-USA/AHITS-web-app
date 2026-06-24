import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'

// M6 / #29 — Deployment-model FOUNDATION data layer. Raw SQL (no generated-client
// coupling, same approach as lib/deployment-requests). This slice provides the
// read + write primitives over the new `deployment_projects` and
// `deployment_assignments` tables. It is intentionally NOT yet wired into any
// route or page: the legacy `Rig.projectId` / `Rig.operatorId` / `rig_operators`
// columns remain the live source until a follow-on PR migrates readers onto
// these tables and adds the self-service handoff UI. Keeping the primitives here
// now means that follow-on PR is purely a rewiring exercise, reviewable on its
// own.

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
