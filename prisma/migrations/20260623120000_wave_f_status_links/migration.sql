-- Wave F: external delivery (tokenized status links) + hub soft-gate status

-- Soft-gate equipment status for unconfirmed hub returns (F-R). Additive enum
-- value; not used within this migration, so it is safe in a transaction (PG 12+).
ALTER TYPE "EquipmentStatus" ADD VALUE IF NOT EXISTS 'IN_TRANSIT';

-- StatusLink enums
CREATE TYPE "StatusLinkType" AS ENUM ('WORK_ORDER', 'HUB_RETURN', 'INVOICE');
CREATE TYPE "StatusLinkState" AS ENUM ('ISSUED', 'VIEWED', 'ACTED', 'COMPLETED', 'EXPIRED', 'REVOKED');

-- status_links
CREATE TABLE "status_links" (
    "id" TEXT NOT NULL,
    "type" "StatusLinkType" NOT NULL,
    "state" "StatusLinkState" NOT NULL DEFAULT 'ISSUED',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maintenanceTaskId" TEXT,
    "inventoryUnitId" TEXT,
    "hubId" TEXT,
    "recipientEmail" TEXT,
    "recipientName" TEXT,
    "createdById" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3),
    "actedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "status_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "status_links_tokenHash_key" ON "status_links"("tokenHash");
CREATE INDEX "status_links_type_state_idx" ON "status_links"("type", "state");
CREATE INDEX "status_links_maintenanceTaskId_idx" ON "status_links"("maintenanceTaskId");
CREATE INDEX "status_links_inventoryUnitId_idx" ON "status_links"("inventoryUnitId");

-- status_link_events
CREATE TABLE "status_link_events" (
    "id" TEXT NOT NULL,
    "statusLinkId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "actorLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "status_link_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "status_link_events_statusLinkId_idx" ON "status_link_events"("statusLinkId");

-- Foreign keys
ALTER TABLE "status_links" ADD CONSTRAINT "status_links_maintenanceTaskId_fkey" FOREIGN KEY ("maintenanceTaskId") REFERENCES "maintenance_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "status_links" ADD CONSTRAINT "status_links_inventoryUnitId_fkey" FOREIGN KEY ("inventoryUnitId") REFERENCES "inventory_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "status_links" ADD CONSTRAINT "status_links_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "status_links" ADD CONSTRAINT "status_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "status_link_events" ADD CONSTRAINT "status_link_events_statusLinkId_fkey" FOREIGN KEY ("statusLinkId") REFERENCES "status_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
