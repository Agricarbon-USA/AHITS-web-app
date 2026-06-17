import { prisma } from '@/lib/prisma'

type AlertMeta = Record<string, string | number | boolean | null>

export async function createAlert(
  type: string,
  sourceTable: string,
  sourceId: string,
  metadata?: AlertMeta,
) {
  const existing = await prisma.alert.findFirst({
    where: { type: type as never, sourceTable, sourceId, resolved: false },
  })
  if (existing) return existing

  return prisma.alert.create({
    data: { type: type as never, sourceTable, sourceId, metadata: metadata ?? {} },
  })
}
