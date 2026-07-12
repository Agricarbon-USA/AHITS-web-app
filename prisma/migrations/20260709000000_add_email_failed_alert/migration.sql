-- FND-8/FND-17: add EMAIL_FAILED alert type so the cron scan can surface swallowed
-- outbound email failures (invoice / shop / hub / invite / material-request sends) as
-- admin-visible, re-actionable alerts.
--
-- Additive enum value only. Postgres forbids referencing a newly added enum value in the
-- SAME transaction that added it; Prisma `migrate deploy` runs each migration file in its
-- own transaction, so app code that creates an 'EMAIL_FAILED'::"AlertType" alert runs
-- safely once this migration commits (the cron revision serves after migrate).
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'EMAIL_FAILED';
