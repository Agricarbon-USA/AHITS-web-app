import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const [totalItems, unseededItems] = await Promise.all([
      prisma.inventoryItem.count({ where: { deletedAt: null } }),
      prisma.inventoryItem.count({
        where: { deletedAt: null, units: { none: { deletedAt: null } } },
      }),
    ])

    const healthy = unseededItems === 0

    if (!healthy) {
      console.warn(
        `[HEALTH] ${unseededItems} of ${totalItems} inventory items have no units. ` +
        `Run: make db-seed-units`
      )
    }

    return NextResponse.json({
      status: healthy ? 'ok' : 'degraded',
      unseededItems,
      totalItems,
    })
  } catch {
    return NextResponse.json({ status: 'error', error: 'Database unreachable' }, { status: 503 })
  }
}
