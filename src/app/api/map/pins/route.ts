import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'
import { getAdminMapPins } from '@/lib/deployment-map-queries'

// CC-15 (D2): admin Deployment Map — one pin per active deployment at its latest
// GPS-bearing daily check. Attestation positions only; no live tracking.
export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const pins = await getAdminMapPins()
  return NextResponse.json({ data: pins })
}
