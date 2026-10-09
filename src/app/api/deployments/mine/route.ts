import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/session'
import { getMyActiveRig } from '@/lib/rig-list'

// PR-5 (L-8) · GET /api/deployments/mine — "which rig am I on", answered once.
// my-deployment, scan, daily-check and operator requests each used to pick
// `GET /api/deployments`[0], which for an admin-as-operator is everyone's newest
// rig. This returns the caller's own active rig (PRIMARY first, then newest — see
// getActiveRigForOperator) in the list element's shape, or `data: null`.
// Cached for offline under sw.ts's existing `/api/deployments` prefix rule.
export async function GET() {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ data: await getMyActiveRig(session.userId) })
}
