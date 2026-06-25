-- MH-1: Multi-hub MIGRATE slice (additive).
-- Wires checkout/return/low-stock onto per-hub stock rows. Two new columns:
--   kit_items.drawnHubId  — records which hub a consumable draw came from so
--                           the return restores to the SAME hub.
--   inventory_stock.reservedQty — reserved counter for Requests R4 (hard-
--                           reserve). Ships default 0; not wired until R4.
-- No data backfill needed: null drawnHubId is the legacy path (restore falls
-- back to item.hubId), and reservedQty = 0 leaves existing available = quantity.

ALTER TABLE "kit_items" ADD COLUMN IF NOT EXISTS "drawnHubId" TEXT;
CREATE INDEX IF NOT EXISTS "kit_items_drawnHubId_idx" ON "kit_items"("drawnHubId");

ALTER TABLE "inventory_stock" ADD COLUMN IF NOT EXISTS "reservedQty" INTEGER NOT NULL DEFAULT 0;
