import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'

// CC-22: admin-gated probe for verifying Sentry server-side capture end to end
// (thrown here → uncaught → src/instrumentation.ts's onRequestError → Sentry,
// tagged with this request's x-request-id). Deliberately NOT a public
// unauthenticated throw endpoint — admin-only, and does nothing destructive.
// With no AHITS_SENTRY_DSN configured, this still throws (that's the point —
// verifying capture requires an actual uncaught error) but instrumentation.ts's
// own no-op-when-absent guard means nothing is sent anywhere.
export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  throw new Error('CC-22 Sentry test — deliberate uncaught server error')
}
