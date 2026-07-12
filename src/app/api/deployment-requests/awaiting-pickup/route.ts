import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/session'
import { getAwaitingPickupForOperator } from '@/lib/deployment-requests'

// CC-09: returns FULFILLED reservation requests with unclaimed held stock for
// the session operator — the "Awaiting Pickup" surface.
export async function GET() {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'OPERATOR') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const requests = await getAwaitingPickupForOperator(session.userId)
  return NextResponse.json({ data: requests })
}
