-- =============================================================================
-- #29 SLICE 4 (CONTRACT) — DROP LEGACY DEPLOYMENT COLUMNS  ***GATED — DO NOT APPLY YET***
-- =============================================================================
-- This is the IRREVERSIBLE final step of the #29 deployment-model refactor.
-- It is intentionally stored OUTSIDE prisma/migrations/ so `make db-migrate`
-- will NOT pick it up by accident. Promote it into a real timestamped migration
-- folder ONLY when ALL of the following are TRUE:
--
--   [ ] Slice 3c shipped — every authorization read and write in the app sources
--       the operator/secondary/project from deployment_assignments /
--       deployment_projects (NOT rigs.operatorId, rigs.projectId, rig_operators).
--       As of Session 11 this is NOT done: ~35 call sites still read the legacy
--       columns. See AHITS_SESSION11_SLICE4_READINESS.md §2.  Until 3c lands,
--       removing these fields from schema.prisma will not even COMPILE.
--   [ ] slice4_precheck.sql run against the target DB → every query returns 0 rows.
--   [ ] reassignPrimary real-data smoke passed on staging (readiness doc §4).
--   [ ] Slice 3b (handoff UI) has soaked on staging with no regression.
--
-- To promote:  mkdir prisma/migrations/<UTC-timestamp>_deployment_model_contract
--              cp this file into it as migration.sql
--              remove operatorId/projectId/operator/project/secondaryOperators
--                from model Rig and delete model RigOperator in schema.prisma
--              make db-generate && make db-migrate   (per CLAUDE.md, before deploy)
-- =============================================================================

BEGIN;

-- 1. Enforce the real invariant first: one OPEN PRIMARY assignment per operator.
--    (Replaces the application-only OPERATOR_HAS_ACTIVE_RIG guard + closes CR-14.)
--    If this fails, STOP — precheck query 1 should have caught it.
CREATE UNIQUE INDEX "deployment_assignments_one_active_primary_per_operator"
  ON "deployment_assignments" ("operatorId")
  WHERE "role" = 'PRIMARY' AND "endedAt" IS NULL;

-- 2. Drop the legacy secondary-operator table.
--    DROP TABLE cascades its own FKs (rig_operators_rigId_fkey,
--    rig_operators_operatorId_fkey) and the rig_operators_rigId_operatorId_key index.
DROP TABLE "rig_operators";

-- 3. Drop the legacy single-project link on rigs.
--    DROP COLUMN auto-drops the dependent FK (rigs_projectId_fkey).
ALTER TABLE "rigs" DROP COLUMN "projectId";

-- 4. Drop the legacy primary-operator column on rigs.
--    DROP COLUMN auto-drops rigs_operatorId_fkey and the rigs_operatorId_idx index.
ALTER TABLE "rigs" DROP COLUMN "operatorId";

COMMIT;
