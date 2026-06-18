import { prisma } from '@/lib/prisma'

type AlertMeta = Record<string, string | number | boolean | null>

export async function createAlert(
  type: string,
  sourceTable: string,
  sourceId: string,
  metadata?: AlertMeta,
) {
  // activeKey enforces "at most one UNRESOLVED alert per source" via a unique
  // constraint (DAT-7), so this is atomic — no findFirst-then-create race. The
  // key is cleared when the alert is resolved, freeing a future alert.
  const activeKey = `${type}:${sourceTable}:${sourceId}`
  try {
    return await prisma.alert.create({
      data: { type: type as never, sourceTable, sourceId, metadata: metadata ?? {}, activeKey },
    })
  } catch (err) {
    // Unique violation → an unresolved alert already exists for this source.
    if ((err as { code?: string }).code === 'P2002') {
      const existing = await prisma.alert.findFirst({ where: { activeKey } })
      if (existing) return existing
    }
    throw err
  }
}
