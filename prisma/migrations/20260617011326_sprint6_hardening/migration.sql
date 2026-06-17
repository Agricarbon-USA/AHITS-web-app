-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "inventory_units" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "hourlyRate" DECIMAL(10,2);

-- CreateIndex
CREATE INDEX "check_logs_itemId_idx" ON "check_logs"("itemId");

-- CreateIndex
CREATE INDEX "check_logs_itemId_action_idx" ON "check_logs"("itemId", "action");

-- CreateIndex
CREATE INDEX "check_logs_inventoryUnitId_idx" ON "check_logs"("inventoryUnitId");

-- CreateIndex
CREATE INDEX "check_logs_operatorId_idx" ON "check_logs"("operatorId");

-- CreateIndex
CREATE INDEX "check_logs_submittedAt_idx" ON "check_logs"("submittedAt");

-- CreateIndex
CREATE INDEX "daily_checks_operatorId_idx" ON "daily_checks"("operatorId");

-- CreateIndex
CREATE INDEX "daily_checks_vehicleId_idx" ON "daily_checks"("vehicleId");

-- CreateIndex
CREATE INDEX "inventory_items_categoryId_idx" ON "inventory_items"("categoryId");

-- CreateIndex
CREATE INDEX "inventory_items_hubId_idx" ON "inventory_items"("hubId");

-- CreateIndex
CREATE INDEX "inventory_items_deletedAt_idx" ON "inventory_items"("deletedAt");

-- CreateIndex
CREATE INDEX "inventory_units_inventoryItemId_idx" ON "inventory_units"("inventoryItemId");

-- CreateIndex
CREATE INDEX "inventory_units_inventoryItemId_status_idx" ON "inventory_units"("inventoryItemId", "status");

-- CreateIndex
CREATE INDEX "inventory_units_status_idx" ON "inventory_units"("status");

-- CreateIndex
CREATE INDEX "kit_items_kitId_idx" ON "kit_items"("kitId");

-- CreateIndex
CREATE INDEX "kit_items_inventoryUnitId_idx" ON "kit_items"("inventoryUnitId");

-- CreateIndex
CREATE INDEX "kit_items_removedAt_idx" ON "kit_items"("removedAt");

-- CreateIndex
CREATE INDEX "rig_vehicles_rigId_removedAt_idx" ON "rig_vehicles"("rigId", "removedAt");

-- CreateIndex
CREATE INDEX "rigs_operatorId_idx" ON "rigs"("operatorId");

-- CreateIndex
CREATE INDEX "rigs_endedAt_idx" ON "rigs"("endedAt");
