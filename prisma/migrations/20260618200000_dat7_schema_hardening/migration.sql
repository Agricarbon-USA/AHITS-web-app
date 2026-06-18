-- DAT-7: schema hardening — itemType enum, serialNumber uniqueness, Alert dedup

-- 1) itemType: String -> enum ItemType (data verified: only SERIALIZED/CONSUMABLE)
CREATE TYPE "ItemType" AS ENUM ('SERIALIZED', 'CONSUMABLE');
ALTER TABLE "inventory_items" ALTER COLUMN "itemType" DROP DEFAULT;
ALTER TABLE "inventory_items"
  ALTER COLUMN "itemType" TYPE "ItemType" USING ("itemType"::text::"ItemType");
ALTER TABLE "inventory_items" ALTER COLUMN "itemType" SET DEFAULT 'CONSUMABLE';

-- 2) serialNumber unique within an item (NULLs are distinct in Postgres)
CREATE UNIQUE INDEX "inventory_units_inventoryItemId_serialNumber_key"
  ON "inventory_units" ("inventoryItemId", "serialNumber");

-- 3) Alert dedup via activeKey
-- 3a) safety net: collapse any duplicate UNRESOLVED alerts, keeping the newest
DELETE FROM "alerts" a
USING "alerts" b
WHERE a."resolved" = false AND b."resolved" = false
  AND a."type" = b."type"
  AND COALESCE(a."sourceTable", '') = COALESCE(b."sourceTable", '')
  AND COALESCE(a."sourceId", '')    = COALESCE(b."sourceId", '')
  AND (a."triggeredAt" < b."triggeredAt"
       OR (a."triggeredAt" = b."triggeredAt" AND a."id" < b."id"));

-- 3b) add the column
ALTER TABLE "alerts" ADD COLUMN "activeKey" TEXT;

-- 3c) backfill the key for existing UNRESOLVED alerts (resolved ones stay NULL)
UPDATE "alerts"
SET "activeKey" = "type"::text || ':' || COALESCE("sourceTable", '') || ':' || COALESCE("sourceId", '')
WHERE "resolved" = false;

-- 3d) enforce one unresolved alert per source (multiple NULLs allowed)
CREATE UNIQUE INDEX "alerts_activeKey_key" ON "alerts" ("activeKey");
