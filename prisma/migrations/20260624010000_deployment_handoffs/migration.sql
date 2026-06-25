CREATE TYPE "DeploymentHandoffStatus" AS ENUM ('PENDING','ACCEPTED','DECLINED','CANCELLED');
CREATE TABLE "deployment_handoffs" (
  "id" TEXT NOT NULL, "rigId" TEXT NOT NULL, "fromOperatorId" TEXT NOT NULL,
  "toOperatorId" TEXT NOT NULL, "initiatedById" TEXT NOT NULL,
  "status" "DeploymentHandoffStatus" NOT NULL DEFAULT 'PENDING',
  "note" TEXT NOT NULL, "responseNote" TEXT, "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deployment_handoffs_pkey" PRIMARY KEY ("id"));
CREATE INDEX "deployment_handoffs_status_idx" ON "deployment_handoffs" ("status");
CREATE INDEX "deployment_handoffs_toOperatorId_idx" ON "deployment_handoffs" ("toOperatorId");
CREATE INDEX "deployment_handoffs_rigId_idx" ON "deployment_handoffs" ("rigId");
-- at most one PENDING handoff per rig
CREATE UNIQUE INDEX "deployment_handoffs_one_pending_per_rig" ON "deployment_handoffs" ("rigId") WHERE "status" = 'PENDING';
ALTER TABLE "deployment_handoffs" ADD CONSTRAINT "deployment_handoffs_rigId_fkey" FOREIGN KEY ("rigId") REFERENCES "rigs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deployment_handoffs" ADD CONSTRAINT "deployment_handoffs_fromOperatorId_fkey" FOREIGN KEY ("fromOperatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deployment_handoffs" ADD CONSTRAINT "deployment_handoffs_toOperatorId_fkey" FOREIGN KEY ("toOperatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deployment_handoffs" ADD CONSTRAINT "deployment_handoffs_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
