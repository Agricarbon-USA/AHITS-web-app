-- Vehicles build-out (workplan §2.4 / M2 #13): give vehicles a real hub-based
-- home instead of free-text `location`. Additive and backward-compatible —
-- the existing `location` column is retained; `hubId` becomes the primary home.
-- FK uses ON DELETE SET NULL so retiring a hub never orphans a vehicle row.

ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "hubId" TEXT;

CREATE INDEX IF NOT EXISTS "vehicles_hubId_idx" ON "vehicles" ("hubId");

DO $$ BEGIN
  ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_hubId_fkey"
    FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
