-- M5 item 25: admin-configurable daily-check checklists.
-- A template overrides the built-in DEFAULT_DAILY_CHECKLIST for vehicles of a
-- given type (vehicleType NULL = a general override for all types). Items are
-- stored as JSON [{key,label}]. Read/written via raw SQL (lib/checklist-templates.ts).
CREATE TABLE "checklist_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicleType" "VehicleType",
    "itemsJson" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "checklist_templates_vehicleType_isActive_idx" ON "checklist_templates" ("vehicleType", "isActive");
