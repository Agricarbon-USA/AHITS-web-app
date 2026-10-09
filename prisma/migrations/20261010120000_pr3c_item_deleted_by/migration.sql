-- PR-3c (D-q · D-o): who deleted an inventory item, and the unit backfill.
-- Additive: one nullable column, its FK, and a data backfill.

-- (1) Who deleted the item (cleared on Restore). A deleted user leaves the item deleted, unattributed.
ALTER TABLE "inventory_items" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_deletedById_fkey"
  FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- (2) Items soft-deleted before this PR left their units live. Give those units the
-- item's own stamp, so they leave every list with it and Restore brings them back
-- with it. No screen ever called DELETE before PR-3c, so this is expected to touch 0 rows.
UPDATE "inventory_units" u
SET "deletedAt" = i."deletedAt"
FROM "inventory_items" i
WHERE u."inventoryItemId" = i."id"
  AND NOT (i."deletedAt" IS NULL)
  AND u."deletedAt" IS NULL;
