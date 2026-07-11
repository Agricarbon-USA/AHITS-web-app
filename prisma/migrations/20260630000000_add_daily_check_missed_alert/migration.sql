-- Add DAILY_CHECK_MISSED alert type for the cron-driven "no check submitted
-- by cutoff" scan. This is distinct from DAILY_CHECK_FAILED (check submitted
-- with passFail=false); this fires when no check was submitted at all.
--
-- Additive enum value only. Postgres forbids referencing a newly added enum
-- value in the SAME transaction that added it; Prisma `migrate deploy` wraps
-- each migration file in its own transaction, so app code that uses
-- 'DAILY_CHECK_MISSED'::"AlertType" runs safely once this migration commits.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'DAILY_CHECK_MISSED';
