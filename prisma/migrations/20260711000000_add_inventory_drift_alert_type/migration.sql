-- AddValue: INVENTORY_DRIFT to AlertType enum
-- Backward-compatible: ALTER TYPE ... ADD VALUE is safe during a live deploy because
-- existing rows are unaffected and the new value is only written by the cron step 8b.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'INVENTORY_DRIFT';
