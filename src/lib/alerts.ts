import { prisma } from '@/lib/prisma'

type AlertMeta = Record<string, string | number | boolean | null>

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
) {
  const activeKey = `${type}:${sourceTable}:${sourceId}`
  return prisma.alert.upsert({
    where: { activeKey },
    create: {
      type: type as never,
      sourceTable,
      sourceId,
      metadata: metadata ?? {},
      activeKey,
    },
    // An unresolved alert for this source already exists — leave it untouched
    // (don't reset notifiedAt / triggeredAt) so it isn't re-notified.
    update: {},
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
