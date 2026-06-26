-- UR-034: a failed daily check must raise an in-app alert + notification, not
-- only an email to ADMIN_EMAIL. Add the alert type.
--
-- Additive enum value only. Postgres forbids referencing a newly added enum
-- value in the SAME transaction that added it; Prisma `migrate deploy` wraps
-- each migration file in its own transaction, so code that uses
-- 'DAILY_CHECK_FAILED'::"AlertType" runs safely once this migration commits.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'DAILY_CHECK_FAILED';
