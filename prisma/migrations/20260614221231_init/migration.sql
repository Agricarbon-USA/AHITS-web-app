-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('TRUCK', 'TRAILER', 'POLARIS_UTV', 'CAN_AM_UTV', 'CHRISTIE_DRILL', 'ATV', 'OTHER');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'IN_MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED');

-- CreateEnum
CREATE TYPE "EquipmentCategory" AS ENUM ('SAMPLING_EQUIPMENT', 'POWER_TOOLS', 'HAND_TOOLS', 'SAFETY_GEAR', 'ELECTRONICS_GPS', 'STORAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('AVAILABLE', 'CHECKED_OUT', 'IN_MAINTENANCE', 'RETIRED');

-- CreateEnum
CREATE TYPE "CheckAction" AS ENUM ('CHECK_OUT', 'CHECK_IN');

-- CreateEnum
CREATE TYPE "Condition" AS ENUM ('GOOD', 'MINOR_DAMAGE', 'NEEDS_REPAIR', 'MISSING_PARTS');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('UPCOMING', 'DUE_SOON', 'OVERDUE', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "IntervalType" AS ENUM ('MILEAGE', 'DAYS', 'MONTHS', 'PER_DEPLOYMENT');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('CROPLAND', 'RANGELAND', 'FORESTRY', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('MAINTENANCE_OVERDUE', 'EQUIPMENT_NOT_RETURNED', 'DAMAGE_REPORTED', 'REPAIR_NEEDED', 'LOW_INVENTORY', 'INSURANCE_EXPIRING', 'REGISTRATION_EXPIRING', 'PIN_LOCKED');

-- CreateEnum
CREATE TYPE "PhotoContext" AS ENUM ('DAMAGE', 'DAILY_CHECK', 'MAINTENANCE', 'INVENTORY_REFERENCE', 'VEHICLE_REFERENCE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
    "pinHash" TEXT,
    "failedPinAttempts" INTEGER NOT NULL DEFAULT 0,
    "pinLockedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "EquipmentCategory" NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCost" DECIMAL(10,2),
    "reorderUrl" TEXT,
    "supplier" TEXT,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'AVAILABLE',
    "location" TEXT,
    "qrCodeId" TEXT NOT NULL,
    "notes" TEXT,
    "lowStockThreshold" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "year" INTEGER,
    "makeModel" TEXT,
    "vin" TEXT,
    "licensePlate" TEXT,
    "odometer" INTEGER,
    "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
    "location" TEXT,
    "assignedOperatorId" TEXT,
    "insuranceExpires" TIMESTAMP(3),
    "registrationExpires" TIMESTAMP(3),
    "qrCodeId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_checks" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "site" TEXT,
    "odometer" INTEGER,
    "checklistJson" JSONB NOT NULL,
    "issues" TEXT,
    "passFail" BOOLEAN NOT NULL DEFAULT true,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "daily_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_logs" (
    "id" TEXT NOT NULL,
    "action" "CheckAction" NOT NULL,
    "itemId" TEXT NOT NULL,
    "operatorId" TEXT,
    "projectId" TEXT,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "condition" "Condition",
    "expectedReturn" TIMESTAMP(3),
    "actualReturn" TIMESTAMP(3),
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "check_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_tasks" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT,
    "itemId" TEXT,
    "taskName" TEXT NOT NULL,
    "intervalType" "IntervalType" NOT NULL,
    "intervalValue" INTEGER NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "lastCompleted" TIMESTAMP(3),
    "lastOdometer" INTEGER,
    "nextDue" TIMESTAMP(3),
    "nextOdometer" INTEGER,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'UPCOMING',
    "estimatedCost" DECIMAL(10,2),
    "actualCost" DECIMAL(10,2),
    "assigneeId" TEXT,
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProjectType" NOT NULL DEFAULT 'CROPLAND',
    "location" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNED',
    "leadId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_equipment" (
    "projectId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "project_equipment_pkey" PRIMARY KEY ("projectId","itemId")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "adminId" TEXT,
    "sourceTable" TEXT,
    "sourceId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "context" "PhotoContext" NOT NULL,
    "dailyCheckId" TEXT,
    "checkLogId" TEXT,
    "maintenanceId" TEXT,
    "inventoryItemId" TEXT,
    "vehicleId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_qrCodeId_key" ON "inventory_items"("qrCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_name_key" ON "vehicles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vin_key" ON "vehicles"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_qrCodeId_key" ON "vehicles"("qrCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_checks_vehicleId_date_operatorId_key" ON "daily_checks"("vehicleId", "date", "operatorId");

-- AddForeignKey
ALTER TABLE "daily_checks" ADD CONSTRAINT "daily_checks_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_checks" ADD CONSTRAINT "daily_checks_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_logs" ADD CONSTRAINT "check_logs_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_logs" ADD CONSTRAINT "check_logs_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_logs" ADD CONSTRAINT "check_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_equipment" ADD CONSTRAINT "project_equipment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_equipment" ADD CONSTRAINT "project_equipment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_dailyCheckId_fkey" FOREIGN KEY ("dailyCheckId") REFERENCES "daily_checks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_checkLogId_fkey" FOREIGN KEY ("checkLogId") REFERENCES "check_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "maintenance_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
