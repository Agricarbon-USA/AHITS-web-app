-- Rigs, Kits, and Deployments schema

CREATE TABLE "rigs" (
  "id" TEXT NOT NULL,
  "label" TEXT,
  "operatorId" TEXT NOT NULL,
  "projectId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rigs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rig_vehicles" (
  "id" TEXT NOT NULL,
  "rigId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "addNote" TEXT NOT NULL,
  "removedAt" TIMESTAMP(3),
  "removeNote" TEXT,
  "photoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT "rig_vehicles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kits" (
  "id" TEXT NOT NULL,
  "rigId" TEXT NOT NULL,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "kits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kit_items" (
  "id" TEXT NOT NULL,
  "kitId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt" TIMESTAMP(3),
  CONSTRAINT "kit_items_pkey" PRIMARY KEY ("id")
);

-- FK constraints
ALTER TABLE "rigs"
  ADD CONSTRAINT "rigs_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rigs"
  ADD CONSTRAINT "rigs_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "rig_vehicles"
  ADD CONSTRAINT "rig_vehicles_rigId_fkey"
  FOREIGN KEY ("rigId") REFERENCES "rigs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rig_vehicles"
  ADD CONSTRAINT "rig_vehicles_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kits"
  ADD CONSTRAINT "kits_rigId_fkey"
  FOREIGN KEY ("rigId") REFERENCES "rigs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kit_items"
  ADD CONSTRAINT "kit_items_kitId_fkey"
  FOREIGN KEY ("kitId") REFERENCES "kits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kit_items"
  ADD CONSTRAINT "kit_items_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
