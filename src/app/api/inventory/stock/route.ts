import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'

// GET /api/inventory/stock?hubId=<id>
// Returns per-hub stock rows for all consumable items at the given hub.
// Used by the operator checkout dialogs to show per-hub availability.
export async function GET(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hubId = req.nextUrl.searchParams.get('hubId')
  if (!hubId) return NextResponse.json({ error: 'hubId is required' }, { status: 400 })

  const rows = await prisma.$queryRaw<{ itemId: string; quantity: number }[]>`
    SELECT s."itemId", s."quantity" - s."reservedQty" AS "quantity"
    FROM "inventory_stock" s
    WHERE s."hubId" = ${hubId}
  `
  return NextResponse.json({ data: rows })
}
