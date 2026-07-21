-- ============================================================================
-- CC-15 Deployment Map — STAGING smoke seed CLEANUP  (staging DB ONLY)
-- ============================================================================
-- Removes the rows inserted by `cc15-staging-smoke-seed.sql`. Every seeded row is
-- id-prefixed `seed-cc15-`, so this is an exact, self-limiting delete — it touches
-- nothing an operator actually submitted. Run AFTER the PR-2 smoke passes.
--
-- SAFE: no schema change, deletes only the synthetic seed rows. Run in the Supabase
-- SQL editor (or psql) against STAGING only. Never run against prod.
-- ============================================================================

DELETE FROM "daily_checks" WHERE "id" LIKE 'seed-cc15-%';

-- Confirm nothing seeded remains (should return 0):
SELECT count(*) AS remaining_seed_rows FROM "daily_checks" WHERE "id" LIKE 'seed-cc15-%';
