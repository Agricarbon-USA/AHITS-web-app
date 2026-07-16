-- CC-22: cron dead-man heartbeat
-- cronLastRunAt on notification_config: persisted on every successful cron
-- dispatcher run; the admin alerts read path compares it against a 30-minute
-- staleness window to raise CRON_SILENT when the cron has gone quiet.
ALTER TABLE "notification_config" ADD COLUMN IF NOT EXISTS "cronLastRunAt" TIMESTAMP(3);
