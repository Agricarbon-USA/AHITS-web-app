import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/session'
import { getCrewLastKnown } from '@/lib/deployment-map-queries'

// CC-15 (D2): operator-facing crew map — other currently-deployed operators' LAST-KNOWN
// positions (from their most recent attestation), for coordinating a gear swap or help.
// The viewer is excluded. No live tracking, no continuous location, zero new operator taps.
export async function GET() {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const positions = await getCrewLastKnown(session.userId)
  return NextResponse.json({ data: positions })
}
