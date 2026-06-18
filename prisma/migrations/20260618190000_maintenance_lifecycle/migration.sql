-- CreateEnum
CREATE TYPE "ResolutionPath" AS ENUM ('IN_FIELD', 'HUB', 'SHOP');

-- AlterTable
ALTER TABLE "maintenance_tasks" ADD COLUMN     "inventoryUnitId" TEXT,
ADD COLUMN     "locationNote" TEXT,
ADD COLUMN     "resolutionPath" "ResolutionPath";

-- CreateIndex
CREATE INDEX "maintenance_tasks_inventoryUnitId_idx" ON "maintenance_tasks"("inventoryUnitId");

-- AddForeignKey
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_inventoryUnitId_fkey" FOREIGN KEY ("inventoryUnitId") REFERENCES "inventory_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
