import { prisma } from '@/lib/prisma'

// Global notification config (single row, id 'global'). Read/written via raw SQL
// so it needs no generated-client coupling. `disabledAlertTypes` is stored
// comma-separated and surfaced as an array.
export interface NotificationConfig {
  dailyCheckCutoff: string
  disabledAlertTypes: string[]
}

const DEFAULT_CUTOFF = '18:00'

function parseDisabled(csv: string | null | undefined): string[] {
  return (csv ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

/** Fetch the config, creating the default row on first access. */
export async function getNotificationConfig(): Promise<NotificationConfig> {
  try {
    const rows = await prisma.$queryRaw<{ dailyCheckCutoff: string; disabledAlertTypes: string }[]>`
      INSERT INTO "notification_config" ("id") VALUES ('global')
      ON CONFLICT ("id") DO UPDATE SET "id" = "notification_config"."id"
      RETURNING "dailyCheckCutoff", "disabledAlertTypes"
    `
    const row = rows[0]
    return {
      dailyCheckCutoff: row?.dailyCheckCutoff ?? DEFAULT_CUTOFF,
      disabledAlertTypes: parseDisabled(row?.disabledAlertTypes),
    }
  } catch {
    // Table missing (pre-migration) or DB blip — fall back to permissive defaults
    // so notification dispatch is never blocked by a config read.
    return { dailyCheckCutoff: DEFAULT_CUTOFF, disabledAlertTypes: [] }
  }
}

/** Persist the config (upserting the single row first). */
export async function updateNotificationConfig(input: {
  dailyCheckCutoff: string
  disabledAlertTypes: string[]
}): Promise<void> {
  await getNotificationConfig() // ensure the row exists
  await prisma.$executeRaw`
    UPDATE "notification_config"
    SET "dailyCheckCutoff" = ${input.dailyCheckCutoff},
        "disabledAlertTypes" = ${input.disabledAlertTypes.join(',')},
        "updatedAt" = now()
    WHERE "id" = 'global'
  `
}

/**
 * CC-22: stamp the in-app cron dead-man's-switch. Called at the end of every
 * successful cron dispatcher run, alongside the external healthchecks.io ping.
 * Upserts so a fresh environment (no row yet) still records the first run.
 */
export async function recordCronHeartbeat(): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "notification_config" ("id", "cronLastRunAt")
    VALUES ('global', now())
    ON CONFLICT ("id") DO UPDATE SET "cronLastRunAt" = now()
  `
}

/** CC-22: last successful cron run, or null if the row/table doesn't exist yet. */
export async function getCronLastRunAt(): Promise<Date | null> {
  try {
    const rows = await prisma.$queryRaw<{ cronLastRunAt: Date | null }[]>`
      SELECT "cronLastRunAt" FROM "notification_config" WHERE "id" = 'global'
    `
    return rows[0]?.cronLastRunAt ?? null
  } catch {
    // Table/column missing (pre-migration) — treat as "never run" rather than
    // blocking the alerts read path.
    return null
  }
}
