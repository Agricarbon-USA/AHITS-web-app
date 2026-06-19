-- DAT-7: Maintenance lifecycle — ResolutionPath enum, inventoryUnitId link,
-- locationNote, and default-value corrections for intervalType/intervalValue.
-- Applied to the DB via `db push` before this migration was recorded; resolved
-- with `prisma migrate resolve --applied` to bring the migration history in sync.

-- CreateEnum
CREATE TYPE "ResolutionPath" AS ENUM ('IN_FIELD', 'HUB', 'SHOP');

-- AlterTable
ALTER TABLE "maintenance_tasks"
  ADD COLUMN "inventoryUnitId" TEXT,
  ADD COLUMN "locationNote"    TEXT,
  ADD COLUMN "resolutionPath"  "ResolutionPath",
  ALTER COLUMN "intervalType"  SET DEFAULT 'DAYS',
  ALTER COLUMN "intervalValue" SET DEFAULT 0;

-- CreateIndex
CREATE INDEX "maintenance_tasks_inventoryUnitId_idx" ON "maintenance_tasks"("inventoryUnitId" ASC);

-- AddForeignKey
ALTER TABLE "maintenance_tasks"
  ADD CONSTRAINT "maintenance_tasks_inventoryUnitId_fkey"
  FOREIGN KEY ("inventoryUnitId") REFERENCES "inventory_units"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
