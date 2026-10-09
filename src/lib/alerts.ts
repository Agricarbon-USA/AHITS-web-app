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
 * PR-4 (D-i · P-8): the notification half of a resolve. A notification is read
 * when the alert behind it resolves — every admin's bell row for it, at once.
 * Called by every resolve path (the two helpers below and the admin Resolve route)
 * inside the caller's transaction, so the alert and its bell rows move together.
 */
export async function markAlertNotificationsRead(alertIds: string[], db: Prisma.TransactionClient = prisma) {
  if (alertIds.length === 0) return
  await db.notification.updateMany({
    where: { alertId: { in: alertIds }, readAt: null },
    data: { readAt: new Date() },
  })
}

/**
 * Notifications that carry no alert but point at one record — a transfer or a
 * handoff request. Their links carry `?transfer=<id>` / `?handoff=<id>` (PR-4), so
 * resolving the record marks exactly its own bell rows read. (Rows written before
 * PR-4 have no id in the link and stay as they are.)
 */
const RECORD_LINK_PARAM: Record<string, string> = {
  transfer_requests: 'transfer',
  deployment_handoffs: 'handoff',
}

/** Resolve the given unresolved alerts and mark their notifications read. */
async function resolveAlertRows(where: Prisma.AlertWhereInput, db: Prisma.TransactionClient) {
  const rows = await db.alert.findMany({ where: { ...where, resolved: false }, select: { id: true } })
  if (rows.length === 0) return
  const ids = rows.map((r) => r.id)
  await db.alert.updateMany({
    where: { id: { in: ids }, resolved: false },
    data: { resolved: true, resolvedAt: new Date(), activeKey: null },
  })
  await markAlertNotificationsRead(ids, db)
}

/**
 * Auto-resolve the active (unresolved) alert for a source, if any. Mirrors the
 * manual resolve route: nulls `activeKey` so a later recurrence can raise a
 * fresh alert. Used by every evaluator's clear (src/lib/alert-evaluators.ts). Its
 * notifications are marked read (PR-4). No-op when there's no active alert.
 */
export async function resolveActiveAlert(
  type: string,
  sourceTable: string,
  sourceId: string,
  // PR-3a (FND-28): the caller's transaction client, so a resolve inside a status
  // change commits or rolls back with it instead of running on the global client.
  db: Prisma.TransactionClient = prisma,
) {
  await resolveAlertRows({ activeKey: `${type}:${sourceTable}:${sourceId}` }, db)
}

/**
 * Resolve every unresolved alert raised for one source row, whatever its type —
 * the clear that matches "this record is closed / retired / gone / answered" — and
 * mark the matching notifications read: those of the resolved alerts, and (for a
 * transfer or handoff) the alert-less request notifications whose link names it.
 */
export async function resolveAlertsFor(
  sourceTable: string,
  sourceId: string,
  db: Prisma.TransactionClient = prisma,
) {
  await resolveAlertRows({ sourceTable, sourceId }, db)
  const param = RECORD_LINK_PARAM[sourceTable]
  if (param) {
    await db.notification.updateMany({
      where: { alertId: null, readAt: null, link: { endsWith: `?${param}=${sourceId}` } },
      data: { readAt: new Date() },
    })
  }
}

/** The link a transfer / handoff request notification carries, so its resolve can find it. */
export function recordLink(path: string, sourceTable: 'transfer_requests' | 'deployment_handoffs', id: string): string {
  return `${path}?${RECORD_LINK_PARAM[sourceTable]}=${id}`
}
