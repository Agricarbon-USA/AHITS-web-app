import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
// CC-29 item 5: sliding session renewal. These come from the jose-only edge module
// (NOT src/lib/auth/session.ts — that pulls prisma + next/headers into the edge
// bundle). One shared definition of the mint helper, cookie flags, and durations.
import { SESSION_COOKIE, sessionCookieOptions, maybeRenewSessionToken } from '@/lib/auth/session-edge'

// NOTE: this file is the app's Next.js middleware. Next.js 16 renamed the
// `middleware` file convention to `proxy` (this repo is on next@^16), so the build
// auto-registers `src/proxy.ts` as the edge middleware via its `proxy` export +
// `config.matcher` below — there is deliberately NO `middleware.ts` (adding one
// alongside this file is a hard build error in Next 16). CSP nonces, edge auth,
// and the request-id all run here; a downgrade below Next 16 would silently disable
// them, which is why `next` is pinned to the 16.x range.

const PUBLIC_PATHS = [
  '/login',
  '/setup-account',
  '/api/health',
  '/api/auth/login',
  '/api/users/invite/validate',
  '/api/users/invite/complete',
  '/api/cron/',
  '/~offline',
  // Wave F: tokenized external status links (login-less, token-gated).
  '/s/',
  '/api/s/',
]

const ADMIN_PATHS = ['/admin']
const OPERATOR_PATHS = ['/operator']

// Workplan §6: operators get org-wide READ-ONLY visibility into a defined subset
// of admin surfaces. Only pages whose mutation controls are gated by useCanEdit()
// belong here — adding a page before it is gated would show operators dead admin
// buttons. Everything else under /admin (Users, Settings, Requests, Reports)
// stays admin-only. Reads for these are requireAuth; writes stay requireAdmin.
const OPERATOR_VIEW_ADMIN_PATHS = [
  '/admin/vehicles',
  '/admin/inventory',
  '/admin/deployments',
  '/admin/maintenance',
  '/admin/hubs',
  '/admin/projects',
  '/admin/dashboard',
]

function getSecret() {
  const s = process.env.PIN_SESSION_SECRET
  if (!s) throw new Error('PIN_SESSION_SECRET not set')
  return new TextEncoder().encode(s)
}

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    // CC-15: Mapbox GL raster tiles / sprites / marker images load from api.mapbox.com.
    "img-src 'self' data: blob: https://*.supabase.co https://api.mapbox.com",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    // CC-22: Sentry's browser SDK reports errors via a direct fetch/beacon to its
    // ingest host from the client bundle (SentryProvider.tsx) — wildcarded because
    // the exact org/region subdomain in SENTRY_DSN isn't known at CSP-build
    // time here (proxy.ts has no access to env-derived per-org values beyond what's
    // hardcoded). Harmless when SENTRY_DSN is unset: nothing ever calls out to
    // it since Sentry.init() is never invoked (see SentryProvider.tsx).
    // CC-15: Mapbox GL fetches vector tiles, styles, glyphs and telemetry over XHR/fetch
    // from api.mapbox.com (tiles/styles/glyphs) and events.mapbox.com (usage telemetry).
    "connect-src 'self' https://*.supabase.co https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://api.mapbox.com https://events.mapbox.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join('; ')
}

// Sets the CSP on both the forwarded request (so Next.js renderer reads the
// nonce for its bootstrap <script> tags) and the response (so the browser
// enforces it). Both sides must carry the same nonce string.
// x-nonce carries the bare nonce value for the root layout to read — that
// `headers()` call opts the entire app into per-request dynamic rendering,
// which is required for Next.js to stamp the nonce on generated <script> tags.
function nextWithCsp(request: NextRequest, csp: string, nonce: string, requestId: string): NextResponse {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('content-security-policy', csp)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('x-request-id', requestId)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

// FND-17: a per-request id, generated once here and stamped on every response the
// middleware returns (via the wrapper below) plus the forwarded request (in
// nextWithCsp), so client reports, server logs, and error trackers can be correlated.
export async function proxy(request: NextRequest) {
  // Generated fresh, NOT read from the client's x-request-id, so a caller can't
  // inject an id into our logs (the forwarded value is overwritten in nextWithCsp).
  // CC-22: src/instrumentation.ts's onRequestError reads this off the forwarded
  // request to tag server-side Sentry captures; src/app/layout.tsx reads it to
  // tag client-side captures via SentryProvider — so a client + server error for
  // the same request correlate under one request_id in Sentry.
  const requestId = crypto.randomUUID()
  try {
    const res = await handleRequest(request, requestId)
    res.headers.set('x-request-id', requestId)
    return res
  } catch (err) {
    // FND-17: an unhandled middleware error still surfaces as Next's edge error
    // (rethrown, behavior unchanged), but log it WITH the request id first so the
    // 500 is correlatable — the error case correlation is exactly the point.
    console.error(`[proxy] unhandled middleware error requestId=${requestId} path=${request.nextUrl.pathname}`, err)
    throw err
  }
}

async function handleRequest(request: NextRequest, requestId: string) {
  const { pathname } = request.nextUrl
  const nonce = btoa(crypto.randomUUID())
  const csp = buildCsp(nonce)

  // Public paths render HTML (login, invite, /s/* token pages) — need the nonce.
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return nextWithCsp(request, csp, nonce, requestId)
  }

  // Static assets that bypass auth — no HTML body, nonce not needed.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/swe-worker')
  ) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const { payload } = await jwtVerify(token, getSecret())
    const role = payload.role as string

    // CC-29 item 5: sliding renewal. Past half-life (and within the 14-day cap since
    // authAt), re-mint the token with the SAME claims + a fresh 24h exp so a shift-long
    // session never hits the synchronized mid-shift JWT cliff. Computed here (the single
    // authenticated chokepoint every page + API request crosses) and applied to the
    // response ACTUALLY returned below. SECURITY TRADEOFF: fixed 24h bounds a stolen
    // token to ≤24h; sliding renewal lets an ACTIVELY-used stolen token live longer,
    // bounded to ≤14 days since PIN entry (never infinite). Instant revocation is
    // unaffected — every API route still runs DB-backed getSession() (tokenVersion /
    // isActive / role), so suspend/force-logout kill a renewed token on its next request.
    const renewedToken = await maybeRenewSessionToken(payload as Record<string, unknown>, Math.floor(Date.now() / 1000))

    // UR-004: a forced-PIN-reset operator (mustChangePin, carried in the JWT)
    // must set a new PIN before doing anything else — enforced SERVER-SIDE here,
    // not just by the client PinChangeGate. Block all mutating API calls (except
    // the change-pin + logout endpoints) and funnel every page to the change-pin
    // screen. GET/read APIs stay allowed so the change-pin screen can load.
    if (payload.mustChangePin === true) {
      if (pathname.startsWith('/api/')) {
        const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
        const allowed = pathname === '/api/auth/change-pin' || pathname === '/api/auth/logout'
        if (mutating && !allowed) {
          return NextResponse.json(
            { error: 'You must set a new PIN before continuing.' },
            { status: 403 },
          )
        }
      } else if (!pathname.startsWith('/operator/change-pin')) {
        return NextResponse.redirect(new URL('/operator/change-pin', request.url))
      }
    }

    // Role-based path guard
    if (pathname.startsWith(ADMIN_PATHS[0]) && role !== 'ADMIN') {
      // Operators may view the read-only subset (workplan §6); everything else
      // under /admin redirects them back to their dashboard.
      const operatorMayView =
        role === 'OPERATOR' &&
        OPERATOR_VIEW_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
      if (!operatorMayView) {
        return NextResponse.redirect(new URL('/operator/dashboard', request.url))
      }
    }

    if (
      pathname.startsWith(OPERATOR_PATHS[0]) &&
      role !== 'OPERATOR' &&
      role !== 'ADMIN'
    ) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Root -> redirect by role
    if (pathname === '/') {
      return NextResponse.redirect(
        new URL(
          role === 'ADMIN' ? '/admin/dashboard' : '/operator/dashboard',
          request.url,
        ),
      )
    }

    const response = nextWithCsp(request, csp, nonce, requestId)
    // CC-29 item 5: set the renewed cookie on the response actually returned. Applied
    // on the main pass-through (every page + API request); the rare in-block redirects
    // above renew on the operator's very next request. Renewal changes exp only — never
    // claims, never mustChangePin.
    if (renewedToken) response.cookies.set(SESSION_COOKIE, renewedToken, sessionCookieOptions())
    return response
  } catch {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|swe-worker).*)',
  ],
}
