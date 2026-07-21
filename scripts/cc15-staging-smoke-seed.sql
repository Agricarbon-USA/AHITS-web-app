-- ============================================================================
-- CC-15 Deployment Map — STAGING smoke seed  (run by Max, staging DB ONLY)
-- ============================================================================
-- WHY THIS EXISTS: the map surfaces read GPS-bearing daily checks, and the
-- daily-check POST server-clamps `date` to *today* (business date). So the API
-- cannot, in a single day, produce a multi-day route trail, amber/red recency
-- pins, or a second operator's crew position. This script back-dates a few GPS
-- `daily_checks` directly so PR-2's smoke gates are actually reachable.
--
-- SAFE: additive INSERTs only, no schema change. Every row is id-prefixed
-- `seed-cc15-` so cleanup is an EXACT id-keyed delete (never date-ranged). And it
-- uses **ON CONFLICT DO NOTHING** — if a real check already exists for a
-- (vehicle, date, operator), it is LEFT UNTOUCHED (the seed never overwrites your
-- real test data; cleanup then can't take it either). This is DATA seeding, not a
-- migration — it does NOT violate the "no db push/migrate against a shared DB"
-- rule. Run in the Supabase SQL editor (or psql) against STAGING only. Not prod.
--
-- WHAT IT ENABLES after you run it and open /admin/map:
--   • one rig with a 3-point route trail (2 days ago → yesterday → today)
--   • recency colours: that rig's pin is GREEN (today); older points form the trail
--   • a SECOND operator's pin on the crew map (/operator/map, viewed as anyone else)
-- Coordinates are around NW Ohio (Agricarbon territory) purely for a sensible view.
-- ============================================================================

-- Part 1 — a 3-day GPS trail for the newest active rig's primary operator/vehicle.
WITH rig1 AS (
  SELECT r.id AS rig_id, rv."vehicleId" AS vehicle_id, a."operatorId" AS operator_id
  FROM "rigs" r
  JOIN "rig_vehicles" rv ON rv."rigId" = r.id AND rv."removedAt" IS NULL
  JOIN "deployment_assignments" a ON a."rigId" = r.id AND a."endedAt" IS NULL AND a."role" = 'PRIMARY'
  WHERE r."endedAt" IS NULL
  ORDER BY r."startedAt" DESC
  LIMIT 1
)
INSERT INTO "daily_checks" ("id","vehicleId","operatorId","date","checklistJson","passFail","submittedAt","syncedAt","gpsLat","gpsLng")
SELECT 'seed-cc15-' || gen_random_uuid(), r.vehicle_id, r.operator_id, d.dt, '[]'::jsonb, true, now(), now(), d.lat, d.lng
FROM rig1 r, (VALUES
  ((CURRENT_DATE - 2), 41.6800::double precision, -83.5400::double precision),
  ((CURRENT_DATE - 1), 41.6900::double precision, -83.5200::double precision),
  ((CURRENT_DATE - 0), 41.7000::double precision, -83.5000::double precision)
) AS d(dt, lat, lng)
ON CONFLICT ("vehicleId","date","operatorId") DO NOTHING; -- never overwrite a real check

-- Part 2 — one GPS check today for a DIFFERENT active-rig primary operator (crew map).
-- No-op if staging has only one active rig/operator (then the crew map stays empty —
-- which is itself a correct, honest result; add a second deployment to smoke it).
WITH op1 AS (
  SELECT a."operatorId" AS operator_id
  FROM "rigs" r
  JOIN "deployment_assignments" a ON a."rigId" = r.id AND a."endedAt" IS NULL AND a."role" = 'PRIMARY'
  WHERE r."endedAt" IS NULL
  ORDER BY r."startedAt" DESC
  LIMIT 1
),
rig2 AS (
  SELECT rv."vehicleId" AS vehicle_id, a."operatorId" AS operator_id
  FROM "rigs" r
  JOIN "rig_vehicles" rv ON rv."rigId" = r.id AND rv."removedAt" IS NULL
  JOIN "deployment_assignments" a ON a."rigId" = r.id AND a."endedAt" IS NULL AND a."role" = 'PRIMARY'
  WHERE r."endedAt" IS NULL
    AND a."operatorId" <> (SELECT operator_id FROM op1)
  ORDER BY r."startedAt" DESC
  LIMIT 1
)
INSERT INTO "daily_checks" ("id","vehicleId","operatorId","date","checklistJson","passFail","submittedAt","syncedAt","gpsLat","gpsLng")
SELECT 'seed-cc15-' || gen_random_uuid(), r.vehicle_id, r.operator_id, CURRENT_DATE, '[]'::jsonb, true, now(), now(), 41.6400::double precision, -83.6200::double precision
FROM rig2 r
ON CONFLICT ("vehicleId","date","operatorId") DO NOTHING; -- never overwrite a real check

-- ── CLEANUP (run after the smoke to remove the seeded rows) ──
-- DELETE FROM "daily_checks" WHERE "id" LIKE 'seed-cc15-%';
