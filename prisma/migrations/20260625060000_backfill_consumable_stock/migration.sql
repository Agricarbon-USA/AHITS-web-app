-- Guarded backfill: seed inventory_stock rows for any non-deleted CONSUMABLE
-- that has a hubId and quantity > 0 but no stock row at that hub yet.
-- Closes the window between the inventory_stock table creation (20260625010000)
-- and the per-POST setStockAtHub call landing in the code, plus any other edge
-- case where a row is missing. Idempotent via ON CONFLICT DO NOTHING.
INSERT INTO "inventory_stock" ("id", "itemId", "hubId", "quantity")
SELECT gen_random_uuid(), i."id", i."hubId", COALESCE(i."quantity", 0)
FROM "inventory_items" i
WHERE i."hubId" IS NOT NULL
  AND i."deletedAt" IS NULL
  AND i."itemType" = 'CONSUMABLE'
  AND i."quantity" > 0
ON CONFLICT ("itemId", "hubId") DO NOTHING;
