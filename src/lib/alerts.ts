import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

type AlertMeta = Record<string, string | number | boolean | null>

// CC-22: the cron dead-man heartbeat alert isn't tied to any real row, so its
// source identity is a fixed pair rather than a record id. Both the raising
// side (admin alerts read path) and the re-arming side (cron dispatch, on
// every successful run) must use these exact constants for the activeKey
// dedup/resolve to match.
export const CRON_SILENT_SOURCE_TABLE = 'system'
export const CRON_SILENT_SOURCE_ID = 'cron-dispatch'

/**
 * Create (or reuse) an unresolved alert for a given source. (CR-5)
 *
 * Uses the `activeKey` unique constraint (DAT-7) as the dedup mechanism instead
 * of the old race-prone findFirst-then-create: `activeKey` is set while the
 * alert is unresolved and nulled on resolve, so the DB enforces "at most one
 * unresolved alert per source." Two concurrent reports collapse to one row via
 * the upsert rather than racing into duplicates.
 */
export async function createAlert(
  type: string,
  sourceTable: string,
  sourceId: string,
  metadata?: AlertMeta,
  // FND-28: pass the caller's interactive-transaction client so the alert commits
  // (or rolls back) atomically with the source write. Without it, an alert created
  // inside a $transaction runs on the global connection and can outlive a rolled-back
  // task (orphaned) — or be lost if the source write's own commit is what failed.
  // Defaults to the global client for the many non-transactional callers; follows the
  // `db = prisma` convention in lib/deployment-assignments.ts.
  db: Prisma.TransactionClient = prisma,
) {
  const activeKey = `${type}:${sourceTable}:${sourceId}`
  return db.alert.upsert({
    where: { activeKey },
    create: {
      type: type as never,
      sourceTable,
      sourceId,
      metadata: metadata ?? {},
      activeKey,
    },
    // An unresolved alert for this source already exists. CC-26: refresh its metadata
    // to the latest values so a re-raise (e.g. a second failed daily check for the same
    // vehicle) points its deep-link at the LATEST relevant record, not the first. Only
    // `metadata` is updated — `notifiedAt`/`triggeredAt` are deliberately left untouched
    // so the alert is NOT re-notified. Safe across all alert types: every caller passes
    // metadata describing the source's current state (no type freezes first-seen data).
    update: { metadata: metadata ?? {} },
  })
}

/**
 * Auto-resolve the active (unresolved) alert for a source, if any. Mirrors the
 * manual resolve route: nulls `activeKey` so a later recurrence can raise a
 * fresh alert. Used by self-clearing scans (e.g. LOW_INVENTORY when stock
 * recovers above threshold). No-op when there's no active alert.
 */
export async function resolveActiveAlert(type: string, sourceTable: string, sourceId: string) {
  const activeKey = `${type}:${sourceTable}:${sourceId}`
  await prisma.alert.updateMany({
    where: { activeKey, resolved: false },
    data: { resolved: true, resolvedAt: new Date(), activeKey: null },
  })
}
