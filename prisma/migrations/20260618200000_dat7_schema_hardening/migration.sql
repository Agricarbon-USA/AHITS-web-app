-- DAT-7: Schema hardening — ItemType enum (replaces plain-text itemType column),
-- alerts deduplication key, and covering indexes on check_logs / inventory_units.
-- Applied to the DB via `db push` before this migration was recorded; resolved
-- with `prisma migrate resolve --applied` to bring the migration history in sync.

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('SERIALIZED', 'CONSUMABLE');

-- AlterTable: alerts dedup key
ALTER TABLE "alerts" ADD COLUMN "activeKey" TEXT;

-- AlterTable: retype inventory_items.itemType from TEXT → ItemType enum
-- (category default corrected at the same time)
ALTER TABLE "inventory_items"
  ALTER COLUMN "category" SET DEFAULT 'OTHER',
  DROP COLUMN "itemType",
  ADD COLUMN  "itemType" "ItemType" NOT NULL DEFAULT 'CONSUMABLE';

-- CreateIndex
CREATE UNIQUE INDEX "alerts_activeKey_key"                        ON "alerts"("activeKey" ASC);
CREATE INDEX        "check_logs_itemId_action_idx"                ON "check_logs"("itemId" ASC, "action" ASC);
CREATE INDEX        "check_logs_itemId_idx"                       ON "check_logs"("itemId" ASC);
CREATE INDEX        "check_logs_operatorId_idx"                   ON "check_logs"("operatorId" ASC);
CREATE INDEX        "check_logs_submittedAt_idx"                  ON "check_logs"("submittedAt" ASC);
CREATE UNIQUE INDEX "inventory_units_inventoryItemId_serialNumber_key" ON "inventory_units"("inventoryItemId" ASC, "serialNumber" ASC);
