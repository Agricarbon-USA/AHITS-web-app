-- Combined migration: inventory-v2 columns + editable category/hub dropdowns

-- Add ItemType enum (was in schema.prisma but never applied to DB)
CREATE TYPE "ItemType" AS ENUM ('SERIALIZED', 'CONSUMABLE');

-- Add new inventory columns that were added to schema but never migrated
ALTER TABLE "inventory_items"
  ADD COLUMN "itemType" "ItemType" NOT NULL DEFAULT 'CONSUMABLE',
  ADD COLUMN "unitId" TEXT,
  ADD COLUMN "expectedQuantity" INTEGER;

-- Create categories table with seed data matching previous EquipmentCategory enum values
CREATE TABLE "categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

INSERT INTO "categories" ("id", "name", "sortOrder") VALUES
  ('cat_sampling',    'Sampling Equipment', 1),
  ('cat_power',       'Power Tools',        2),
  ('cat_hand',        'Hand Tools',         3),
  ('cat_safety',      'Safety Gear',        4),
  ('cat_electronics', 'Electronics & GPS',  5),
  ('cat_storage',     'Storage',            6),
  ('cat_other',       'Other',              7);

-- Create hubs table with seed data
CREATE TABLE "hubs" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hubs_pkey" PRIMARY KEY ("id")
);

INSERT INTO "hubs" ("id", "name", "city", "state") VALUES
  ('hub_piedmont', 'Piedmont Hub', 'Piedmont', 'SC'),
  ('hub_waterloo',  'Waterloo Hub',  'Waterloo',  'IA');

-- Add new FK columns to inventory_items (nullable initially for backfill)
ALTER TABLE "inventory_items"
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "hubId" TEXT;

-- Backfill categoryId from old enum value
UPDATE "inventory_items" SET "categoryId" = CASE "category"::text
  WHEN 'SAMPLING_EQUIPMENT' THEN 'cat_sampling'
  WHEN 'POWER_TOOLS'        THEN 'cat_power'
  WHEN 'HAND_TOOLS'         THEN 'cat_hand'
  WHEN 'SAFETY_GEAR'        THEN 'cat_safety'
  WHEN 'ELECTRONICS_GPS'    THEN 'cat_electronics'
  WHEN 'STORAGE'            THEN 'cat_storage'
  ELSE 'cat_other'
END;

-- hubId stays NULL for all existing rows (hubLocation column was never in DB)

-- Make categoryId required
ALTER TABLE "inventory_items" ALTER COLUMN "categoryId" SET NOT NULL;

-- Add FK constraints
ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_hubId_fkey"
  FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop old enum column
ALTER TABLE "inventory_items" DROP COLUMN "category";

-- Drop the enum types
DROP TYPE IF EXISTS "EquipmentCategory";
DROP TYPE IF EXISTS "HubLocation";
