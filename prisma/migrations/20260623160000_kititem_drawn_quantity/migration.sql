-- N-2 / CR-1a: track the actual CONSUMABLE stock drawn at check-out so returns
-- restore exactly what was drawn (never more), preventing on-hand overshoot.

ALTER TABLE "kit_items" ADD COLUMN "drawnQuantity" INTEGER NOT NULL DEFAULT 0;

-- Backfill in-flight checkouts: items still held in the field (removedAt IS NULL)
-- predate this column. Under the prior logic a check-out drew down the full
-- requested quantity, so seed drawnQuantity = quantity for active kit items —
-- this preserves correct restore behaviour for consumables already deployed when
-- the migration lands. (Serialized items never use drawnQuantity for stock, so
-- the value is harmless there.)
UPDATE "kit_items" SET "drawnQuantity" = "quantity" WHERE "removedAt" IS NULL;
