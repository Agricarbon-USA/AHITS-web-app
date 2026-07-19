-- CC-14 (NS-10): daily-check time-to-complete instrumentation.
-- durationMs on daily_checks: client-measured time from form open → submit, set
-- passively (no new operator capture). Feeds the pilot "how long does a check take"
-- read alongside the adoption metric. Nullable + additive → backward-compatible: the
-- deploy.yml migrate job runs before the new revision serves, and the prior revision
-- neither reads nor writes this column.
ALTER TABLE "daily_checks" ADD COLUMN IF NOT EXISTS "durationMs" INTEGER;
