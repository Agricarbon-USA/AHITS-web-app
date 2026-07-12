-- CC-09: Awaiting Pickup
-- holdExpiresAt on deployment_requests: protects held stock for the pickup
-- surface so the TTL sweep cannot release holds that are still visible to
-- the operator, regardless of app activity (e.g. Friday fulfill → Monday pickup).
-- fromRequestId on rigs: traceability — which fulfilled reservation seeded
-- a given deployment's pickup flow.
ALTER TABLE "deployment_requests" ADD COLUMN IF NOT EXISTS "holdExpiresAt" TIMESTAMP(3);
ALTER TABLE "rigs" ADD COLUMN IF NOT EXISTS "fromRequestId" TEXT;
CREATE INDEX IF NOT EXISTS "rigs_fromRequestId_idx" ON "rigs"("fromRequestId");
