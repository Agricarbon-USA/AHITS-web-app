-- Gap migration: creates tables/columns that were added via db push but never captured in migrations.
-- All DDL uses IF NOT EXISTS so this is idempotent against the real DB.
-- Sits between 20260615003430_update_for_rbac_admin and 20260616000001_sprint7_inoperable_damage.

-- New enums
DO $$ BEGIN
  CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "TransferStatus" ADD VALUE 'CANCELLED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Columns added to existing tables (not present in init or rbac migrations)
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "hourlyRate" DECIMAL(10,2);

ALTER TABLE "inventory_items"
  ADD COLUMN IF NOT EXISTS "itemType"         TEXT    NOT NULL DEFAULT 'CONSUMABLE',
  ADD COLUMN IF NOT EXISTS "unitId"           TEXT,
  ADD COLUMN IF NOT EXISTS "expectedQuantity" INTEGER,
  ADD COLUMN IF NOT EXISTS "categoryId"       TEXT,
  ADD COLUMN IF NOT EXISTS "hubId"            TEXT,
  ADD COLUMN IF NOT EXISTS "deletedAt"        TIMESTAMP(3);

ALTER TABLE "check_logs"
  ADD COLUMN IF NOT EXISTS "inventoryUnitId" TEXT;

-- maintenance_tasks.hubId (repairHubId is added by sprint7_inoperable_damage)
ALTER TABLE "maintenance_tasks"
  ADD COLUMN IF NOT EXISTS "hubId" TEXT;

-- New tables
CREATE TABLE IF NOT EXISTS "categories" (
    "id"        TEXT         NOT NULL,
    "name"      TEXT         NOT NULL,
    "sortOrder" INTEGER      NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "hubs" (
    "id"        TEXT         NOT NULL,
    "name"      TEXT         NOT NULL,
    "city"      TEXT         NOT NULL,
    "state"     TEXT         NOT NULL,
    "isActive"  BOOLEAN      NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hubs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "rigs" (
    "id"         TEXT         NOT NULL,
    "label"      TEXT,
    "operatorId" TEXT         NOT NULL,
    "projectId"  TEXT,
    "startedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt"    TIMESTAMP(3),
    "notes"      TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rigs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "rig_operators" (
    "id"         TEXT         NOT NULL,
    "rigId"      TEXT         NOT NULL,
    "operatorId" TEXT         NOT NULL,
    "addedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rig_operators_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "rig_vehicles" (
    "id"         TEXT         NOT NULL,
    "rigId"      TEXT         NOT NULL,
    "vehicleId"  TEXT         NOT NULL,
    "addedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addNote"    TEXT         NOT NULL,
    "removedAt"  TIMESTAMP(3),
    "removeNote" TEXT,
    "photoUrls"  TEXT[]       DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "rig_vehicles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "kits" (
    "id"        TEXT         NOT NULL,
    "rigId"     TEXT         NOT NULL,
    "label"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "kits_pkey" PRIMARY KEY ("id")
);

-- inventory_units without sprint7-specific inoperable columns (sprint7_inoperable_damage adds those)
CREATE TABLE IF NOT EXISTS "inventory_units" (
    "id"              TEXT             NOT NULL,
    "qrCodeId"        TEXT             NOT NULL,
    "inventoryItemId" TEXT             NOT NULL,
    "serialNumber"    TEXT,
    "status"          "EquipmentStatus" NOT NULL DEFAULT 'AVAILABLE',
    "notes"           TEXT,
    "deletedAt"       TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "inventory_units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "kit_items" (
    "id"              TEXT         NOT NULL,
    "kitId"           TEXT         NOT NULL,
    "inventoryItemId" TEXT         NOT NULL,
    "quantity"        INTEGER      NOT NULL DEFAULT 1,
    "inventoryUnitId" TEXT,
    "addedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt"       TIMESTAMP(3),
    CONSTRAINT "kit_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "transfer_requests" (
    "id"            TEXT             NOT NULL,
    "fromRigId"     TEXT             NOT NULL,
    "toOperatorId"  TEXT             NOT NULL,
    "initiatedById" TEXT             NOT NULL,
    "note"          TEXT             NOT NULL,
    "photoUrls"     TEXT[]           DEFAULT ARRAY[]::TEXT[],
    "status"        "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "responseNote"  TEXT,
    "respondedAt"   TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "transfer_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "transfer_vehicles" (
    "id"                TEXT NOT NULL,
    "transferRequestId" TEXT NOT NULL,
    "vehicleId"         TEXT NOT NULL,
    CONSTRAINT "transfer_vehicles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "transfer_items" (
    "id"                TEXT    NOT NULL,
    "transferRequestId" TEXT    NOT NULL,
    "kitItemId"         TEXT    NOT NULL,
    "quantity"          INTEGER,
    "inventoryUnitId"   TEXT,
    CONSTRAINT "transfer_items_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "rigs_operatorId_idx"              ON "rigs"("operatorId");
CREATE INDEX IF NOT EXISTS "rigs_endedAt_idx"                 ON "rigs"("endedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "rig_operators_rigId_operatorId_key" ON "rig_operators"("rigId", "operatorId");
CREATE INDEX IF NOT EXISTS "rig_vehicles_rigId_removedAt_idx" ON "rig_vehicles"("rigId", "removedAt");
CREATE INDEX IF NOT EXISTS "kit_items_kitId_idx"              ON "kit_items"("kitId");
CREATE INDEX IF NOT EXISTS "kit_items_inventoryUnitId_idx"    ON "kit_items"("inventoryUnitId");
CREATE INDEX IF NOT EXISTS "kit_items_removedAt_idx"          ON "kit_items"("removedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_units_qrCodeId_key" ON "inventory_units"("qrCodeId");
CREATE INDEX IF NOT EXISTS "inventory_units_inventoryItemId_idx" ON "inventory_units"("inventoryItemId");
CREATE INDEX IF NOT EXISTS "inventory_units_status_idx"       ON "inventory_units"("status");
CREATE INDEX IF NOT EXISTS "inventory_units_deletedAt_idx"    ON "inventory_units"("deletedAt");
CREATE INDEX IF NOT EXISTS "inventory_items_categoryId_idx"   ON "inventory_items"("categoryId");
CREATE INDEX IF NOT EXISTS "inventory_items_hubId_idx"        ON "inventory_items"("hubId");
CREATE INDEX IF NOT EXISTS "inventory_items_deletedAt_idx"    ON "inventory_items"("deletedAt");
CREATE INDEX IF NOT EXISTS "check_logs_inventoryUnitId_idx"   ON "check_logs"("inventoryUnitId");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "rigs" ADD CONSTRAINT "rigs_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "rigs" ADD CONSTRAINT "rigs_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "rig_operators" ADD CONSTRAINT "rig_operators_rigId_fkey"
    FOREIGN KEY ("rigId") REFERENCES "rigs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "rig_operators" ADD CONSTRAINT "rig_operators_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "rig_vehicles" ADD CONSTRAINT "rig_vehicles_rigId_fkey"
    FOREIGN KEY ("rigId") REFERENCES "rigs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "rig_vehicles" ADD CONSTRAINT "rig_vehicles_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "kits" ADD CONSTRAINT "kits_rigId_fkey"
    FOREIGN KEY ("rigId") REFERENCES "rigs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "kit_items" ADD CONSTRAINT "kit_items_kitId_fkey"
    FOREIGN KEY ("kitId") REFERENCES "kits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "kit_items" ADD CONSTRAINT "kit_items_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "kit_items" ADD CONSTRAINT "kit_items_inventoryUnitId_fkey"
    FOREIGN KEY ("inventoryUnitId") REFERENCES "inventory_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_fromRigId_fkey"
    FOREIGN KEY ("fromRigId") REFERENCES "rigs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_toOperatorId_fkey"
    FOREIGN KEY ("toOperatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_initiatedById_fkey"
    FOREIGN KEY ("initiatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "transfer_vehicles" ADD CONSTRAINT "transfer_vehicles_transferRequestId_fkey"
    FOREIGN KEY ("transferRequestId") REFERENCES "transfer_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "transfer_vehicles" ADD CONSTRAINT "transfer_vehicles_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_transferRequestId_fkey"
    FOREIGN KEY ("transferRequestId") REFERENCES "transfer_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_kitItemId_fkey"
    FOREIGN KEY ("kitItemId") REFERENCES "kit_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_inventoryUnitId_fkey"
    FOREIGN KEY ("inventoryUnitId") REFERENCES "inventory_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_hubId_fkey"
    FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "check_logs" ADD CONSTRAINT "check_logs_inventoryUnitId_fkey"
    FOREIGN KEY ("inventoryUnitId") REFERENCES "inventory_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_hubId_fkey"
    FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
