import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Allow static/api-without-auth paths
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/swe-worker')
  ) {
    return NextResponse.next()
  }

  const token = request.cookies.get('ahits_session')?.value

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const { payload } = await jwtVerify(token, getSecret())
    const role = payload.role as string

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

    return NextResponse.next()
  } catch {
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|swe-worker).*)',
  ],
}
