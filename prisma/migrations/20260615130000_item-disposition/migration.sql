-- Add INOPERABLE to EquipmentStatus enum
ALTER TYPE "EquipmentStatus" ADD VALUE 'INOPERABLE' AFTER 'IN_MAINTENANCE';

-- Create RepairType enum
CREATE TYPE "RepairType" AS ENUM ('IN_FIELD', 'AT_SHOP', 'SHIP_TO_HUB', 'SHIP_FOR_REPAIR');

-- Make intervalType and intervalValue nullable in maintenance_tasks
ALTER TABLE "maintenance_tasks" ALTER COLUMN "intervalType" DROP NOT NULL;
ALTER TABLE "maintenance_tasks" ALTER COLUMN "intervalValue" DROP NOT NULL;

-- Add repair fields to maintenance_tasks
ALTER TABLE "maintenance_tasks" ADD COLUMN "isDamageReport" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "maintenance_tasks" ADD COLUMN "repairType"     "RepairType";
ALTER TABLE "maintenance_tasks" ADD COLUMN "shopName"       TEXT;
ALTER TABLE "maintenance_tasks" ADD COLUMN "shopAddress"    TEXT;
ALTER TABLE "maintenance_tasks" ADD COLUMN "dateDelivered"  TIMESTAMP(3);
ALTER TABLE "maintenance_tasks" ADD COLUMN "purchaseOrder"  TEXT;
ALTER TABLE "maintenance_tasks" ADD COLUMN "invoiceNumber"  TEXT;
ALTER TABLE "maintenance_tasks" ADD COLUMN "repairHubId"    TEXT;

ALTER TABLE "maintenance_tasks"
  ADD CONSTRAINT "maintenance_tasks_repairHubId_fkey"
  FOREIGN KEY ("repairHubId") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add inoperable fields to inventory_items
ALTER TABLE "inventory_items" ADD COLUMN "inoperableNotes"        TEXT;
ALTER TABLE "inventory_items" ADD COLUMN "inoperableReportedAt"   TIMESTAMP(3);
ALTER TABLE "inventory_items" ADD COLUMN "inoperableReportedById" TEXT;

ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_inoperableReportedById_fkey"
  FOREIGN KEY ("inoperableReportedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
