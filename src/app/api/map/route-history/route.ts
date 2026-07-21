import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'
import { getRigRouteHistory } from '@/lib/deployment-map-queries'

// CC-15 (D2): a rig's route history — the chronological trail of its daily-check GPS
// points ("where has this rig been"). Historical only, never a live position.
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rigId = req.nextUrl.searchParams.get('rigId')
  if (!rigId) return NextResponse.json({ error: 'rigId is required' }, { status: 400 })

  const trail = await getRigRouteHistory(rigId)
  return NextResponse.json({ data: trail })
}
