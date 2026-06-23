-- M3: global notification configuration (single row, id = 'global').
-- daily-check cutoff time + comma-separated list of disabled alert types.
CREATE TABLE "notification_config" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "dailyCheckCutoff" TEXT NOT NULL DEFAULT '18:00',
    "disabledAlertTypes" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_config_pkey" PRIMARY KEY ("id")
);
