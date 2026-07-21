-- ============================================================================
-- CC-15 Deployment Map — STAGING smoke seed CLEANUP  (staging DB ONLY)
-- ============================================================================
-- Removes EVERY row inserted by the CC-15 smoke seed. All seeded rows — across all
-- six tables — are id-prefixed `seed-cc15-`, so every delete below is an exact,
-- id-keyed match. There is NO date-ranged delete anywhere: a real check / vehicle /
-- user / rig has a cuid id and can never match `seed-cc15-%`, so this cannot touch
-- anything you actually created.
--
-- Two tiers of seed exist:
--   • the daily-check trail seed (just `daily_checks` rows), and
--   • the full-coverage fabrication (two synthetic deployments: users + vehicles +
--     rigs + assignments + rig_vehicles + checks) for amber/red pins + the crew map.
-- This script cleans up both. Deletes run child→parent so FK constraints are satisfied.
--
-- SAFE: no schema change, id-keyed deletes only. Run in the Supabase SQL editor (or
-- psql) against STAGING only, AFTER the smoke passes. Never run against prod.
-- ============================================================================

DELETE FROM "daily_checks"           WHERE "id" LIKE 'seed-cc15-%';
DELETE FROM "rig_vehicles"           WHERE "id" LIKE 'seed-cc15-%';
DELETE FROM "deployment_assignments" WHERE "id" LIKE 'seed-cc15-%';
DELETE FROM "rigs"                   WHERE "id" LIKE 'seed-cc15-%';
DELETE FROM "vehicles"               WHERE "id" LIKE 'seed-cc15-%';
DELETE FROM "users"                  WHERE "id" LIKE 'seed-cc15-%';

-- Confirm nothing seeded remains anywhere (every count should be 0):
SELECT
  (SELECT count(*) FROM "daily_checks"           WHERE "id" LIKE 'seed-cc15-%') AS checks,
  (SELECT count(*) FROM "rig_vehicles"           WHERE "id" LIKE 'seed-cc15-%') AS rig_vehicles,
  (SELECT count(*) FROM "deployment_assignments" WHERE "id" LIKE 'seed-cc15-%') AS assignments,
  (SELECT count(*) FROM "rigs"                   WHERE "id" LIKE 'seed-cc15-%') AS rigs,
  (SELECT count(*) FROM "vehicles"               WHERE "id" LIKE 'seed-cc15-%') AS vehicles,
  (SELECT count(*) FROM "users"                  WHERE "id" LIKE 'seed-cc15-%') AS users;
