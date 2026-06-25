-- R1 Requests Redesign: column additions.
-- Depends on 20260625020000_requests_redesign_enums committing first (enum values
-- must exist in a prior committed transaction before being used as column defaults).

-- DeploymentRequest: discriminator + routing + lifecycle columns (all additive)
ALTER TABLE "deployment_requests"
  ADD COLUMN IF NOT EXISTS "requestType"         "DeploymentRequestType" NOT NULL DEFAULT 'RESERVATION'::"DeploymentRequestType",
  ADD COLUMN IF NOT EXISTS "fulfillerHubId"      TEXT,
  ADD COLUMN IF NOT EXISTS "fulfillerOperatorId" TEXT,
  ADD COLUMN IF NOT EXISTS "decisionNote"        TEXT,
  ADD COLUMN IF NOT EXISTS "decidedAt"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fulfilledAt"         TIMESTAMP(3);

-- DeploymentRequestLine: unit reference + free-text fields (all additive)
ALTER TABLE "deployment_request_lines"
  ADD COLUMN IF NOT EXISTS "specificInventoryUnitId" TEXT,
  ADD COLUMN IF NOT EXISTS "description"             TEXT,
  ADD COLUMN IF NOT EXISTS "reorderUrl"              TEXT;

-- StatusLink: deploymentRequestId FK (for RESERVATION hub-portal links)
ALTER TABLE "status_links"
  ADD COLUMN IF NOT EXISTS "deploymentRequestId" TEXT;

CREATE INDEX IF NOT EXISTS "status_links_deploymentRequestId_idx"
  ON "status_links" ("deploymentRequestId");

DO $$ BEGIN
  ALTER TABLE "status_links" ADD CONSTRAINT "status_links_deploymentRequestId_fkey"
    FOREIGN KEY ("deploymentRequestId") REFERENCES "deployment_requests"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
