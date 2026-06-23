-- CR-8: uniform soft-delete. Vehicles and maintenance tasks gain a deletedAt
-- tombstone (InventoryItem/InventoryUnit already have one) so admin "delete"
-- stops throwing FK 500s and never orphans check/maintenance history.
ALTER TABLE "vehicles" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "vehicles_deletedAt_idx" ON "vehicles"("deletedAt");

ALTER TABLE "maintenance_tasks" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "maintenance_tasks_deletedAt_idx" ON "maintenance_tasks"("deletedAt");
