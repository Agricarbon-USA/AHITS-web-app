-- Wave 2A.5 — Account Management
-- Adds session-revocation + per-operator defaults to users, an invite
-- revocation timestamp, and an account audit log.
--
-- NOTE: hand-authored to match Prisma's generated conventions. Verify with
-- `make db-migrate-dev` (prisma migrate dev) before deploy — if Prisma reports
-- a drift it will offer the canonical SQL.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mustChangePin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "homeHubId" TEXT;

-- AlterTable
ALTER TABLE "invite_tokens" ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "account_audit_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_homeHubId_idx" ON "users"("homeHubId");

-- CreateIndex
CREATE INDEX "account_audit_log_targetUserId_idx" ON "account_audit_log"("targetUserId");

-- CreateIndex
CREATE INDEX "account_audit_log_createdAt_idx" ON "account_audit_log"("createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_homeHubId_fkey" FOREIGN KEY ("homeHubId") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_audit_log" ADD CONSTRAINT "account_audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_audit_log" ADD CONSTRAINT "account_audit_log_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
