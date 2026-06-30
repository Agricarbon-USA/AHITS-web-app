-- Wave 0 query-path indexes: additive only, fully reversible (DROP INDEX).
-- Each index targets a known hot read path identified in the Wave 0 analysis:
--   transfers by recipient/status and rig; daily-checks by operator/date;
--   alerts by resolution state and source; maintenance by vehicle/item/status;
--   kit→rig, rig→project, deployment-request by fulfiller hub.

-- TransferRequest
CREATE INDEX IF NOT EXISTS "transfer_requests_toOperatorId_status_idx" ON "transfer_requests"("toOperatorId", "status");
CREATE INDEX IF NOT EXISTS "transfer_requests_fromRigId_idx" ON "transfer_requests"("fromRigId");

-- TransferVehicle
CREATE INDEX IF NOT EXISTS "transfer_vehicles_transferRequestId_idx" ON "transfer_vehicles"("transferRequestId");

-- TransferItem
CREATE INDEX IF NOT EXISTS "transfer_items_transferRequestId_idx" ON "transfer_items"("transferRequestId");

-- DailyCheck
CREATE INDEX IF NOT EXISTS "daily_checks_operatorId_idx" ON "daily_checks"("operatorId");
CREATE INDEX IF NOT EXISTS "daily_checks_submittedAt_idx" ON "daily_checks"("submittedAt");

-- Alert
CREATE INDEX IF NOT EXISTS "alerts_resolved_triggeredAt_idx" ON "alerts"("resolved", "triggeredAt");
CREATE INDEX IF NOT EXISTS "alerts_sourceTable_sourceId_idx" ON "alerts"("sourceTable", "sourceId");

-- MaintenanceTask
CREATE INDEX IF NOT EXISTS "maintenance_tasks_vehicleId_idx" ON "maintenance_tasks"("vehicleId");
CREATE INDEX IF NOT EXISTS "maintenance_tasks_itemId_idx" ON "maintenance_tasks"("itemId");
CREATE INDEX IF NOT EXISTS "maintenance_tasks_status_nextDue_idx" ON "maintenance_tasks"("status", "nextDue");

-- Kit
CREATE INDEX IF NOT EXISTS "kits_rigId_idx" ON "kits"("rigId");

-- Rig
CREATE INDEX IF NOT EXISTS "rigs_projectId_idx" ON "rigs"("projectId");

-- DeploymentRequest
CREATE INDEX IF NOT EXISTS "deployment_requests_fulfillerHubId_idx" ON "deployment_requests"("fulfillerHubId");
