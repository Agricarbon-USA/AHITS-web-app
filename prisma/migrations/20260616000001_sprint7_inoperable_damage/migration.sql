-- CreateEnum (idempotent — may already exist via db push)
DO $$ BEGIN
  CREATE TYPE "RepairType" AS ENUM ('IN_FIELD', 'AT_SHOP', 'SHIP_TO_HUB', 'SHIP_FOR_REPAIR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum (idempotent — ADD VALUE is a no-op if value already exists in PG 14+)
ALTER TYPE "EquipmentStatus" ADD VALUE IF NOT EXISTS 'INOPERABLE';

-- AlterTable: InventoryUnit — add inoperable tracking fields
ALTER TABLE "inventory_units"
  ADD COLUMN IF NOT EXISTS "inoperableNotes"        TEXT,
  ADD COLUMN IF NOT EXISTS "inoperableReportedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "inoperableReportedById" TEXT;

-- AlterTable: MaintenanceTask — add damage report fields
ALTER TABLE "maintenance_tasks"
  ADD COLUMN IF NOT EXISTS "isDamageReport"  BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "repairType"      "RepairType",
  ADD COLUMN IF NOT EXISTS "shopName"        TEXT,
  ADD COLUMN IF NOT EXISTS "shopAddress"     TEXT,
  ADD COLUMN IF NOT EXISTS "dateDelivered"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "purchaseOrder"   TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceNumber"   TEXT,
  ADD COLUMN IF NOT EXISTS "repairHubId"     TEXT;

-- AddForeignKey (idempotent)
DO $$ BEGIN
  ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_repairHubId_fkey"
    FOREIGN KEY ("repairHubId") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
