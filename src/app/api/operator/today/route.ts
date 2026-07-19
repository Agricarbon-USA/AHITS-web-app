import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/session'
import { getOperatorToday } from '@/lib/operator-today'

// CC-14 (NS-10) · GET /api/operator/today — the read-side spine for the operator
// "Today" view. Thin auth wrapper over getOperatorToday (the assembly lives in lib so
// it's fixture-testable). The ONE round-trip the Today surface consumes via useFreshList.
// Read-only, zero schema, backward-compatible additive route. Cached as a field read
// (src/app/sw.ts) so the morning view survives offline.
export async function GET() {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // CC-11: an admin may hold a rig (admin-as-operator) and gets the same Today surface.
  if (session.role !== 'OPERATOR' && session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await getOperatorToday(session.userId, session.role)
  return NextResponse.json({ data })
}
