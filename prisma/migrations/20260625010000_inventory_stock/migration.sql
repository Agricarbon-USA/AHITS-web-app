-- Multi-hub inventory stock (workplan §2.2) — EXPAND slice.
-- Additive: one row per (item, hub). Backfilled from each consumable item's
-- current (hubId, quantity). Legacy InventoryItem.quantity/hubId are RETAINED;
-- no live checkout/return path is rewired in this slice.

CREATE TABLE IF NOT EXISTS "inventory_stock" (
    "id"        TEXT NOT NULL,
    "itemId"    TEXT NOT NULL,
    "hubId"     TEXT NOT NULL,
    "quantity"  INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_stock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_stock_itemId_hubId_key"
    ON "inventory_stock" ("itemId", "hubId");
CREATE INDEX IF NOT EXISTS "inventory_stock_hubId_idx"
    ON "inventory_stock" ("hubId");

DO $$ BEGIN
  ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_hubId_fkey"
    FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: every non-deleted CONSUMABLE item that has a hub gets a stock row at
-- that hub carrying its current quantity. Idempotent via ON CONFLICT.
-- gen_random_uuid() is available on Supabase Postgres (used by the #29 backfill).
INSERT INTO "inventory_stock" ("id", "itemId", "hubId", "quantity")
SELECT gen_random_uuid(), i."id", i."hubId", COALESCE(i."quantity", 0)
FROM "inventory_items" i
WHERE i."hubId" IS NOT NULL
  AND i."deletedAt" IS NULL
  AND i."itemType" = 'CONSUMABLE'
ON CONFLICT ("itemId", "hubId") DO NOTHING;
