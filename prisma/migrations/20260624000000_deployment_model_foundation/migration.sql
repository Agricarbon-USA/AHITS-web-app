-- M6 / #29: Deployment-model refactor — FOUNDATION slice.
-- Additive only: introduces a Rig↔Project many-to-many (deployment_projects)
-- and operator-assignment history (deployment_assignments, PRIMARY/SECONDARY
-- with started/ended), then BACKFILLS both from existing data. The legacy
-- columns (rigs.projectId, rigs.operatorId) and the rig_operators table are
-- left in place during the transition, so this migration changes no existing
-- reader. A follow-on PR migrates readers onto these tables and adds the
-- one-active-PRIMARY-per-operator unique constraint.

-- ── Types ────────────────────────────────────────────────────────────────────
CREATE TYPE "DeploymentAssignmentRole" AS ENUM ('PRIMARY', 'SECONDARY');

-- ── deployment_projects (Rig ↔ Project M2M) ─────────────────────────────────
CREATE TABLE "deployment_projects" (
    "id" TEXT NOT NULL,
    "rigId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    CONSTRAINT "deployment_projects_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "deployment_projects_rigId_projectId_key" ON "deployment_projects" ("rigId", "projectId");
CREATE INDEX "deployment_projects_projectId_idx" ON "deployment_projects" ("projectId");
ALTER TABLE "deployment_projects"
  ADD CONSTRAINT "deployment_projects_rigId_fkey"
  FOREIGN KEY ("rigId") REFERENCES "rigs" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deployment_projects"
  ADD CONSTRAINT "deployment_projects_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── deployment_assignments (operator history) ───────────────────────────────
CREATE TABLE "deployment_assignments" (
    "id" TEXT NOT NULL,
    "rigId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "role" "DeploymentAssignmentRole" NOT NULL DEFAULT 'PRIMARY',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "addedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deployment_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "deployment_assignments_rigId_idx" ON "deployment_assignments" ("rigId");
CREATE INDEX "deployment_assignments_operatorId_idx" ON "deployment_assignments" ("operatorId");
CREATE INDEX "deployment_assignments_operatorId_role_endedAt_idx" ON "deployment_assignments" ("operatorId", "role", "endedAt");
ALTER TABLE "deployment_assignments"
  ADD CONSTRAINT "deployment_assignments_rigId_fkey"
  FOREIGN KEY ("rigId") REFERENCES "rigs" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deployment_assignments"
  ADD CONSTRAINT "deployment_assignments_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deployment_assignments"
  ADD CONSTRAINT "deployment_assignments_addedById_fkey"
  FOREIGN KEY ("addedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Backfill ────────────────────────────────────────────────────────────────
INSERT INTO "deployment_projects" ("id", "rigId", "projectId", "addedAt", "removedAt")
SELECT gen_random_uuid()::text, r."id", r."projectId", r."startedAt", r."endedAt"
FROM "rigs" r
WHERE r."projectId" IS NOT NULL;

INSERT INTO "deployment_assignments" ("id", "rigId", "operatorId", "role", "startedAt", "endedAt", "createdAt")
SELECT gen_random_uuid()::text, r."id", r."operatorId", 'PRIMARY'::"DeploymentAssignmentRole", r."startedAt", r."endedAt", now()
FROM "rigs" r;

INSERT INTO "deployment_assignments" ("id", "rigId", "operatorId", "role", "startedAt", "endedAt", "createdAt")
SELECT gen_random_uuid()::text, ro."rigId", ro."operatorId", 'SECONDARY'::"DeploymentAssignmentRole", ro."addedAt", r."endedAt", now()
FROM "rig_operators" ro
JOIN "rigs" r ON r."id" = ro."rigId";
