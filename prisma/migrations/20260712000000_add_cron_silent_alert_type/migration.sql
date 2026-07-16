-- AddValue: CRON_SILENT to AlertType enum
-- Backward-compatible: ALTER TYPE ... ADD VALUE is safe during a live deploy because
-- existing rows are unaffected. Kept in its own migration (isolated from the
-- cronLastRunAt column below) because Postgres forbids using a newly-added enum
-- value within the same transaction it was added in (CC-22).
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'CRON_SILENT';
