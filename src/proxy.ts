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
  '/~offline',
]

const ADMIN_PATHS = ['/admin']
const OPERATOR_PATHS = ['/operator']

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

    // Role-based path guard
    if (pathname.startsWith(ADMIN_PATHS[0]) && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/operator/dashboard', request.url))
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
