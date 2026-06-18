import { NextRequest, NextResponse } from 'next/server'

// CSP violation sink (SEC-4). While the policy ships as Report-Only, browsers
// POST violation reports here; we log them so they surface in Cloud Run logs and
// we can tune the policy before flipping it to enforcing. Public by design
// (browsers send these unauthenticated) and intentionally cheap — it never
// touches the database and always returns 204.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // Browsers send either {"csp-report": {...}} (report-uri) or a report array
    // (report-to). Log a compact line either way.
    const report = body?.['csp-report'] ?? body
    const blocked = report?.['blocked-uri'] ?? report?.blockedURL
    const directive = report?.['violated-directive'] ?? report?.effectiveDirective
    console.warn('[csp-report]', JSON.stringify({ blocked, directive }))
  } catch {
    // Ignore malformed/empty bodies — never error on a reporting endpoint.
  }
  return new NextResponse(null, { status: 204 })
}
