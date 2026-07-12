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

/** Current operator + project roster for one or more deployments, sourced from the new tables.
 *  `operator.role` (D3): the Time/Invoicing capstone (CC-17) and any other payroll/attribution
 *  reader MUST check this and exclude PRIMARY assignments where role === 'ADMIN' — an admin
 *  covering a rig (admin-as-operator) is explicitly NOT a payroll event. Not enforced here
 *  because no attribution consumer exists yet; see DECISIONS.md D3. */
export interface DeploymentRoster {
  operator: { id: string; name: string; email: string; role: string } | null
  operatorId: string | null
  secondaryOperators: { operator: { id: string; name: string; email: string; role: string } }[]
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
    { rigId: string; operatorId: string; name: string | null; email: string | null; role: string; userRole: string | null }[]
  >`
    SELECT a."rigId", a."operatorId", u."name", u."email", a."role"::text AS "role", u."role"::text AS "userRole"
    FROM "deployment_assignments" a
    LEFT JOIN "users" u ON u."id" = a."operatorId"
    WHERE a."rigId" IN (${Prisma.join(rigIds)}) AND a."endedAt" IS NULL
  `
  for (const a of assignments) {
    const r = map.get(a.rigId)
    if (!r) continue
    if (a.role === 'PRIMARY') {
      r.operator = { id: a.operatorId, name: a.name ?? '', email: a.email ?? '', role: a.userRole ?? 'OPERATOR' }
      r.operatorId = a.operatorId
    } else {
      r.secondaryOperators.push({ operator: { id: a.operatorId, name: a.name ?? '', email: a.email ?? '', role: a.userRole ?? 'OPERATOR' } })
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

/**
 * UR-032: roster for DISPLAY / attribution. Identical to getDeploymentRosters for
 * an ACTIVE deployment (has an open assignment → returns the open roster), but for
 * an ENDED deployment (no open assignments) it returns the FINAL roster — the batch
 * closed together by `endAllAssignmentsForRig`, which stamps every then-open
 * assignment with the same `endedAt`. Without this, ended deployments serialize
 * `operator: null`, losing "who ran this deployment" in history/reports.
 */
export async function getDeploymentRostersForDisplay(
  rigIds: string[],
  db: RawClient = prisma,
): Promise<Map<string, DeploymentRoster>> {
  const map = new Map<string, DeploymentRoster>()
  if (rigIds.length === 0) return map
  for (const id of rigIds) {
    map.set(id, { operator: null, operatorId: null, secondaryOperators: [], projects: [] })
  }

  const assignments = await db.$queryRaw<
    { rigId: string; operatorId: string; name: string | null; email: string | null; role: string; userRole: string | null }[]
  >`
    WITH agg AS (
      SELECT "rigId",
             bool_or("endedAt" IS NULL) AS has_open,
             MAX("endedAt")            AS max_ended
      FROM "deployment_assignments"
      WHERE "rigId" IN (${Prisma.join(rigIds)})
      GROUP BY "rigId"
    )
    SELECT a."rigId", a."operatorId", u."name", u."email", a."role"::text AS "role", u."role"::text AS "userRole"
    FROM "deployment_assignments" a
    JOIN agg ON agg."rigId" = a."rigId"
    LEFT JOIN "users" u ON u."id" = a."operatorId"
    WHERE a."rigId" IN (${Prisma.join(rigIds)})
      AND ( a."endedAt" IS NULL
         OR (agg.has_open = false AND a."endedAt" = agg.max_ended) )
  `
  for (const a of assignments) {
    const r = map.get(a.rigId)
    if (!r) continue
    if (a.role === 'PRIMARY') {
      r.operator = { id: a.operatorId, name: a.name ?? '', email: a.email ?? '', role: a.userRole ?? 'OPERATOR' }
      r.operatorId = a.operatorId
    } else {
      r.secondaryOperators.push({ operator: { id: a.operatorId, name: a.name ?? '', email: a.email ?? '', role: a.userRole ?? 'OPERATOR' } })
    }
  }

  // Projects unchanged from the active roster (deployment_projects is gated on its
  // own removedAt, independent of assignment end).
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
    if (r) r.projects.push({ id: p.projectId, name: p.name ?? '' })
  }

  return map
}

export async function getDeploymentRosterForDisplay(
  rigId: string,
  db: RawClient = prisma,
): Promise<DeploymentRoster> {
  const map = await getDeploymentRostersForDisplay([rigId], db)
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
export async function addProjectLink(rigId: string, projectId: string, db: RawClient = prisma): Promise<void> {
  await db.$executeRaw`
    INSERT INTO "deployment_projects" ("id", "rigId", "projectId")
    VALUES (${randomUUID()}, ${rigId}, ${projectId})
    ON CONFLICT ("rigId", "projectId") DO UPDATE SET "removedAt" = NULL`
}

/** Soft-close a project link (sets removedAt). Returns true if a row changed. */
export async function removeProjectLink(rigId: string, projectId: string, db: RawClient = prisma): Promise<boolean> {
  const n = await db.$executeRaw`
    UPDATE "deployment_projects" SET "removedAt" = now()
    WHERE "rigId" = ${rigId} AND "projectId" = ${projectId} AND "removedAt" IS NULL`
  return Number(n) > 0
}

/** Soft-close all active project links for a rig (used when ending or re-projecting). */
export async function removeAllProjectLinks(rigId: string, db: RawClient = prisma): Promise<void> {
  await db.$executeRaw`
    UPDATE "deployment_projects" SET "removedAt" = now()
    WHERE "rigId" = ${rigId} AND "removedAt" IS NULL`
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

/** W0-10 PR-1: true if the operator has an OPEN assignment (any role) on this rig.
 *  The role-agnostic authorization primitive that replaces the legacy
 *  (Rig.operatorId primary + rig_operators secondary) ownership check. */
export async function hasOpenAssignment(rigId: string, operatorId: string, db: RawClient = prisma): Promise<boolean> {
  const rows = await db.$queryRaw<{ ok: number }[]>`
    SELECT 1 AS ok FROM "deployment_assignments"
    WHERE "rigId" = ${rigId} AND "operatorId" = ${operatorId} AND "endedAt" IS NULL
    LIMIT 1`
  return rows.length > 0
}

/** W0-10 PR-1: the open PRIMARY operatorId for a rig (null if none), from the
 *  assignment table — the successor to reading Rig.operatorId as "who runs this rig". */
export async function getActivePrimaryForRig(rigId: string, db: RawClient = prisma): Promise<string | null> {
  const rows = await db.$queryRaw<{ operatorId: string }[]>`
    SELECT "operatorId" FROM "deployment_assignments"
    WHERE "rigId" = ${rigId} AND "role" = 'PRIMARY' AND "endedAt" IS NULL
    ORDER BY "startedAt" DESC LIMIT 1`
  return rows[0]?.operatorId ?? null
}

/** W0-10 PR-1: derive each vehicle's currently-assigned operator — the open PRIMARY of
 *  the active rig the vehicle is in — the successor to Vehicle.assignedOperatorId. The
 *  one-open-RigVehicle-per-vehicle invariant means at most one active rig per vehicle. */
/** W0-10 PR-4: the open PRIMARY operator for a rig, REQUIRED. Throws if none — after the
 *  legacy Rig.operatorId fallback is gone, the one-open-PRIMARY-per-rig invariant (PR-2
 *  index B) guarantees an active rig has exactly one; a missing row is data corruption and
 *  must fail loudly rather than silently mis-attribute. */
/** W0-10 PR-4: the active rig an operator holds as open PRIMARY (successor to
 *  `rig.findFirst({ operatorId, endedAt: null })`), or null. */
/** W0-10 PR-4: attach roster-sourced operator/secondaryOperators/operatorId to a rig
 *  response object (successor to the dropped `operator`/`secondaryOperators` includes). */
export async function hydrateRigOperator<T extends { id: string }>(rig: T) {
  const ro = await getDeploymentRosterForDisplay(rig.id)
  return {
    ...rig,
    operatorId: ro.operatorId ?? null,
    operator: ro.operator ? { id: ro.operator.id, name: ro.operator.name } : { id: 'unknown', name: 'Unknown operator' },
    secondaryOperators: ro.secondaryOperators,
  }
}

/** W0-10 PR-4: attach each transfer's source-rig PRIMARY operator (successor to the dropped
 *  fromRig.operator include) for list/detail display. Batched. */
export async function hydrateTransfersFromRig<T extends { fromRigId: string; fromRig: { id: string } }>(
  transfers: T[],
) {
  const rosters = await getDeploymentRostersForDisplay(transfers.map((t) => t.fromRig.id))
  return transfers.map((t) => ({
    ...t,
    fromRig: {
      ...t.fromRig,
      operator: rosters.get(t.fromRig.id)?.operator ?? null,
    },
  }))
}

export async function getActiveRigForOperator(operatorId: string, db: RawClient = prisma): Promise<string | null> {
  const rows = await db.$queryRaw<{ rigId: string }[]>`
    SELECT a."rigId" FROM "deployment_assignments" a
    JOIN "rigs" r ON r."id" = a."rigId" AND r."endedAt" IS NULL
    WHERE a."operatorId" = ${operatorId} AND a."role" = 'PRIMARY' AND a."endedAt" IS NULL
    LIMIT 1`
  return rows[0]?.rigId ?? null
}

export async function getRequiredPrimaryForRig(rigId: string, db: RawClient = prisma): Promise<string> {
  const primary = await getActivePrimaryForRig(rigId, db)
  if (!primary) throw new Error(`No open PRIMARY assignment for rig ${rigId}`)
  return primary
}

// ── Money-loop attribution hook (D3) ───────────────────────────────────────
// CC-11 lets an admin hold a rig as PRIMARY (admin-as-operator), and D3 requires
// admin-held rigs be EXCLUDED from payroll attribution. Nothing computes payroll
// yet — that's the Time/Invoicing capstone (CC-17). When it's built, every place
// it turns a PRIMARY assignment into hours/pay MUST filter out operator.role ===
// 'ADMIN' first (roster reads already carry `role` via DeploymentRoster.operator.role
// / getVehicleOperators below would need the same `u."role"` join if it becomes an
// attribution source). Do not let an admin covering a rig generate a payroll line.

export async function getVehicleOperators(
  vehicleIds: string[], db: RawClient = prisma,
): Promise<Map<string, { operatorId: string; operatorName: string | null }>> {
  const m = new Map<string, { operatorId: string; operatorName: string | null }>()
  if (vehicleIds.length === 0) return m
  const rows = await db.$queryRaw<{ vehicleId: string; operatorId: string; operatorName: string | null }[]>`
    SELECT rv."vehicleId", a."operatorId", u."name" AS "operatorName"
    FROM "rig_vehicles" rv
    JOIN "rigs" r ON r."id" = rv."rigId" AND r."endedAt" IS NULL
    JOIN "deployment_assignments" a ON a."rigId" = r."id" AND a."role" = 'PRIMARY' AND a."endedAt" IS NULL
    LEFT JOIN "users" u ON u."id" = a."operatorId"
    WHERE rv."vehicleId" IN (${Prisma.join(vehicleIds)}) AND rv."removedAt" IS NULL
    ORDER BY a."startedAt" DESC`
  for (const r of rows) if (!m.has(r.vehicleId)) m.set(r.vehicleId, { operatorId: r.operatorId, operatorName: r.operatorName })
  return m
}

/** Open a new operator assignment on a deployment. */
export async function addAssignment(
  input: { rigId: string; operatorId: string; role: AssignmentRole; addedById?: string | null; note?: string | null },
  db: RawClient = prisma,
): Promise<string> {
  const id = randomUUID()
  await db.$executeRaw`
    INSERT INTO "deployment_assignments" ("id", "rigId", "operatorId", "role", "addedById", "note")
    VALUES (${id}, ${input.rigId}, ${input.operatorId},
            ${input.role}::"DeploymentAssignmentRole", ${input.addedById ?? null}, ${input.note ?? null})`
  return id
}

/** Idempotent add: inserts an open assignment only if one of that role isn't already open. */
export async function ensureOpenAssignment(
  input: { rigId: string; operatorId: string; role: AssignmentRole; addedById?: string | null; note?: string | null },
  db: RawClient = prisma,
): Promise<void> {
  await db.$executeRaw`
    INSERT INTO "deployment_assignments" ("id", "rigId", "operatorId", "role", "addedById", "note")
    SELECT ${randomUUID()}, ${input.rigId}, ${input.operatorId}, ${input.role}::"DeploymentAssignmentRole", ${input.addedById ?? null}, ${input.note ?? null}
    WHERE NOT EXISTS (
      SELECT 1 FROM "deployment_assignments"
      WHERE "rigId" = ${input.rigId} AND "operatorId" = ${input.operatorId}
        AND "role" = ${input.role}::"DeploymentAssignmentRole" AND "endedAt" IS NULL)`
}

/** End an operator's open assignment on a deployment. Returns true if one changed. */
export async function endAssignment(rigId: string, operatorId: string, db: RawClient = prisma): Promise<boolean> {
  const n = await db.$executeRaw`
    UPDATE "deployment_assignments" SET "endedAt" = now()
    WHERE "rigId" = ${rigId} AND "operatorId" = ${operatorId} AND "endedAt" IS NULL`
  return Number(n) > 0
}

/** End a specific-role open assignment for an operator on a deployment. */
export async function endAssignmentByRole(
  rigId: string,
  operatorId: string,
  role: AssignmentRole,
  db: RawClient = prisma,
): Promise<boolean> {
  const n = await db.$executeRaw`
    UPDATE "deployment_assignments" SET "endedAt" = now()
    WHERE "rigId" = ${rigId} AND "operatorId" = ${operatorId}
      AND "role" = ${role}::"DeploymentAssignmentRole" AND "endedAt" IS NULL`
  return Number(n) > 0
}

/** End all open assignments for a rig (used when ending a deployment). */
export async function endAllAssignmentsForRig(rigId: string, db: RawClient = prisma): Promise<void> {
  await db.$executeRaw`
    UPDATE "deployment_assignments" SET "endedAt" = now()
    WHERE "rigId" = ${rigId} AND "endedAt" IS NULL`
}
