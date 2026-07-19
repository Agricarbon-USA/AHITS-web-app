import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'
import { getDailyCheckAdoption } from '@/lib/pilot-metrics'

// CC-14: admin read of the Pilot Charter metric 1 (daily-check adoption denominator).
// Must exist day 1 of the pilot. Optional ?date=YYYY-MM-DD (defaults to today's
// business date). Admin-only.
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const day = req.nextUrl.searchParams.get('date') ?? undefined
  const validDay = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined

  const adoption = await getDailyCheckAdoption(validDay)
  return NextResponse.json({ data: adoption })
}
