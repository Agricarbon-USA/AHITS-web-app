-- DropForeignKey
ALTER TABLE "inventory_items" DROP CONSTRAINT "inventory_items_inoperableReportedById_fkey";

-- AlterTable
ALTER TABLE "check_logs" ADD COLUMN     "inventoryUnitId" TEXT;

-- AlterTable
ALTER TABLE "inventory_items" DROP COLUMN "inoperableNotes",
DROP COLUMN "inoperableReportedAt",
DROP COLUMN "inoperableReportedById",
DROP COLUMN "status";

-- AlterTable
ALTER TABLE "kit_items" ADD COLUMN     "inventoryUnitId" TEXT;

-- CreateTable
CREATE TABLE "inventory_units" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "serialNumber" TEXT,
    "qrCodeId" TEXT NOT NULL,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "inoperableNotes" TEXT,
    "inoperableReportedAt" TIMESTAMP(3),
    "inoperableReportedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_units_qrCodeId_key" ON "inventory_units"("qrCodeId");

-- AddForeignKey
ALTER TABLE "kit_items" ADD CONSTRAINT "kit_items_inventoryUnitId_fkey" FOREIGN KEY ("inventoryUnitId") REFERENCES "inventory_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_inoperableReportedById_fkey" FOREIGN KEY ("inoperableReportedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_logs" ADD CONSTRAINT "check_logs_inventoryUnitId_fkey" FOREIGN KEY ("inventoryUnitId") REFERENCES "inventory_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
