-- W0-8: photos had zero indexes, so every photo include (daily-check, maintenance,
-- inventory, vehicle drawers) was a sequential scan. Add the FK indexes. IF NOT
-- EXISTS keeps this idempotent across environments that may already carry some.
CREATE INDEX IF NOT EXISTS "photos_dailyCheckId_idx" ON "photos"("dailyCheckId");
CREATE INDEX IF NOT EXISTS "photos_checkLogId_idx" ON "photos"("checkLogId");
CREATE INDEX IF NOT EXISTS "photos_maintenanceId_idx" ON "photos"("maintenanceId");
CREATE INDEX IF NOT EXISTS "photos_inventoryItemId_idx" ON "photos"("inventoryItemId");
CREATE INDEX IF NOT EXISTS "photos_vehicleId_idx" ON "photos"("vehicleId");
CREATE INDEX IF NOT EXISTS "photos_uploadedById_idx" ON "photos"("uploadedById");

-- deployment_requests.requestType is declared @@index in schema.prisma but no
-- migration ever created it (schema/migration drift, FND-46). Create it so a
-- migrations-built DB matches the schema.
CREATE INDEX IF NOT EXISTS "deployment_requests_requestType_idx" ON "deployment_requests"("requestType");
