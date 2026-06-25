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
