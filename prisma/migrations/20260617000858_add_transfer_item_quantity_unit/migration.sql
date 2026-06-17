-- AlterTable
ALTER TABLE "transfer_items" ADD COLUMN     "inventoryUnitId" TEXT,
ADD COLUMN     "quantity" INTEGER;

-- AddForeignKey
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_inventoryUnitId_fkey" FOREIGN KEY ("inventoryUnitId") REFERENCES "inventory_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
