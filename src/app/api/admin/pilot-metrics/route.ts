import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'
import { getPilotMetrics } from '@/lib/pilot-metrics'

// CC-14 / CC-31: admin read of the Pilot Charter dashboard payload — per-day adoption,
// time-to-complete distribution, GPS grant rate, the day's checks (drill-down), and the
// most-recent day's per-rig operator+vehicle breakdown. Optional ?from/?to (YYYY-MM-DD);
// defaults to the pilot fortnight to date. Admin-only.
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const from = req.nextUrl.searchParams.get('from') ?? undefined
  const to = req.nextUrl.searchParams.get('to') ?? undefined

  const data = await getPilotMetrics(from, to)
  return NextResponse.json({ data })
}
