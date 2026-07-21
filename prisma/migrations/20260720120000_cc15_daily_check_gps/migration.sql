-- CC-15 (D2): Deployment Map — GPS on the daily-check attestation.
-- Three additive nullable columns on daily_checks: gpsLat/gpsLng/gpsAccuracy,
-- mirroring Photo.gpsLat/gpsLng (DOUBLE PRECISION). Captured once per check at
-- buildPayload time on-device; location is resolve-or-skip and never blocks a
-- check, so denied/dismissed/timed-out submits (and every pre-CC-15 row) are NULL.
-- These are attestation points ("where has this rig been"), never live position.
--
-- Backward-compatible: nullable + additive → the deploy.yml / pr-staging-deploy.yml
-- migrate job runs before the new revision serves, and the prior revision neither
-- reads nor writes these columns.
ALTER TABLE "daily_checks" ADD COLUMN IF NOT EXISTS "gpsLat" DOUBLE PRECISION;
ALTER TABLE "daily_checks" ADD COLUMN IF NOT EXISTS "gpsLng" DOUBLE PRECISION;
ALTER TABLE "daily_checks" ADD COLUMN IF NOT EXISTS "gpsAccuracy" DOUBLE PRECISION;
