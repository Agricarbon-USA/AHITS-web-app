-- W0-10 PR-2c · FND-23 index C — one OPEN RigVehicle per vehicle.
--
-- The successor to Vehicle.assignedOperatorId's single-holder guarantee: a physical
-- vehicle is in exactly one place, so it may have at most one open (removedAt IS NULL)
-- rig_vehicles row. "Per vehicle" (not per rig+vehicle) is deliberate — a truck cannot be
-- on two rigs at once regardless of which rigs they are.
--
-- ORDERING — this MUST land only AFTER PR-2b (the end/decline/cancel vehicle close-out +
-- the ended-rig backfill) is deployed and confirmed live in the target environment. PR-2b
-- makes "removedAt IS NULL" a true proxy for "on an active rig" and removes the strand paths;
-- creating this index before that is live would abort the deploy on historical/stranded rows.
-- This mirrors the PR-1-readers-before-PR-4-drop discipline (writer before constraint).
--
-- HARD PROD GATE — run BOTH pre-flights on the target DB (staging, then prod immediately
-- before the merge); each must return ZERO rows. The backfill closes ended-rig rows, but it
-- CANNOT fix a vehicle with two open rows on two DIFFERENT ACTIVE rigs (a pre-existing
-- concurrent-add race) — that residue must be reconciled BY HAND (keep the row for the rig
-- the vehicle is physically on; stamp removedAt on the other) before this index will create.
--
--   -- broad pre-flight (any duplicate open row per vehicle — the exact set this index rejects):
--   -- SELECT "vehicleId", COUNT(*) FROM "rig_vehicles" WHERE "removedAt" IS NULL GROUP BY 1 HAVING COUNT(*) > 1;
--   -- residue the backfill can't fix (2+ open rows on different ACTIVE rigs — needs manual reconcile):
--   -- SELECT rv."vehicleId", array_agg(rv."rigId") AS rig_ids
--   -- FROM "rig_vehicles" rv JOIN "rigs" r ON r."id" = rv."rigId"
--   -- WHERE rv."removedAt" IS NULL AND r."endedAt" IS NULL
--   -- GROUP BY rv."vehicleId" HAVING COUNT(DISTINCT rv."rigId") > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "rig_vehicles_one_open_per_vehicle"
  ON "rig_vehicles" ("vehicleId") WHERE "removedAt" IS NULL;
