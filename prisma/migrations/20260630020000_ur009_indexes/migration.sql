-- UR-009: remaining FK/status indexes on heavily-filtered columns.
-- Additive + fully reversible (DROP INDEX). Postgres does NOT auto-create indexes
-- for foreign-key columns, so these relation-loaded FKs — and the dispatch cron's
-- scan column — were unindexed and would degrade as rows accrue.

-- MaintenanceTask: repair-hub FK (hub inbound / repair-tracking views)
CREATE INDEX IF NOT EXISTS "maintenance_tasks_repairHubId_idx" ON "maintenance_tasks"("repairHubId");

-- Alert: the notification dispatcher scans (resolved = false, notifiedAt IS NULL)
-- on every 15-minute run — give it a direct composite index.
CREATE INDEX IF NOT EXISTS "alerts_resolved_notifiedAt_idx" ON "alerts"("resolved", "notifiedAt");

-- Photo: had zero indexes; these FKs are relation-loaded by the galleries.
CREATE INDEX IF NOT EXISTS "photos_maintenanceId_idx" ON "photos"("maintenanceId");
CREATE INDEX IF NOT EXISTS "photos_inventoryItemId_idx" ON "photos"("inventoryItemId");
CREATE INDEX IF NOT EXISTS "photos_vehicleId_idx" ON "photos"("vehicleId");
CREATE INDEX IF NOT EXISTS "photos_dailyCheckId_idx" ON "photos"("dailyCheckId");
CREATE INDEX IF NOT EXISTS "photos_uploadedById_idx" ON "photos"("uploadedById");
