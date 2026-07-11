-- UR-010 (R4 hold-through-claim): snapshot the stock held for the operator onto
-- the request line at fulfill, and track how much has been claimed at checkout +
-- a release-once marker. Additive + fully reversible (DROP COLUMN / DROP INDEX).
ALTER TABLE "deployment_request_lines"
  ADD COLUMN IF NOT EXISTS "heldQty"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "heldItemId" TEXT,
  ADD COLUMN IF NOT EXISTS "heldHubId"  TEXT,
  ADD COLUMN IF NOT EXISTS "claimedQty" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "releasedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "deployment_request_lines_heldItemId_heldHubId_idx"
  ON "deployment_request_lines"("heldItemId", "heldHubId");
