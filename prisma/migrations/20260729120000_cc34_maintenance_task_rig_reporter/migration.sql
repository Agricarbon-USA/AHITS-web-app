-- CC-34 (1b): give a maintenance task the deployment it came from and who reported it.
-- Two nullable scalar columns on maintenance_tasks, no backfill, no default. Damage
-- created from a deployment sets both; review-inoperable and admin field-fix leave
-- them null (there is no rig context there, which is correct).
--
-- Additive-only: nullable ADD COLUMN plus CREATE INDEX add no constraint and drop
-- nothing, so the change is backward-compatible. The deploy.yml migrate job runs
-- before the new revision serves, and the prior revision ignores unknown columns.
-- Passes scripts/check-migration-safety.sh (no NOT NULL, no default, no destructive arm).
ALTER TABLE "maintenance_tasks" ADD COLUMN "rigId" TEXT;
ALTER TABLE "maintenance_tasks" ADD COLUMN "reportedById" TEXT;

CREATE INDEX IF NOT EXISTS "maintenance_tasks_rigId_idx" ON "maintenance_tasks"("rigId");
CREATE INDEX IF NOT EXISTS "maintenance_tasks_reportedById_idx" ON "maintenance_tasks"("reportedById");
