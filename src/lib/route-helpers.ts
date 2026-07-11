import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdmin } from '@/lib/auth/session'

// W0-8: shared route primitives so new Phase-3 routes stay consistent instead of
// each re-implementing the auth preamble and its own response envelope. Existing
// routes are migrated opportunistically; new routes should start here.

export type Session = NonNullable<Awaited<ReturnType<typeof requireAuth>>>
type RouteCtx = { params: Promise<Record<string, string>> }

/** Standard success envelope: `{ data }`. */
export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status })
}

/** Standard error envelope: `{ error }`. */
export function fail(error: string, status = 400): NextResponse {
  return NextResponse.json({ error }, { status })
}

/** Run a handler only for an authenticated session (else 401). */
export function withAuth(
  handler: (session: Session, req: NextRequest, ctx: RouteCtx) => Promise<Response> | Response,
) {
  return async (req: NextRequest, ctx: RouteCtx): Promise<Response> => {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return handler(session, req, ctx)
  }
}

/** Run a handler only for an admin session (else 403). */
export function withAdmin(
  handler: (session: Session, req: NextRequest, ctx: RouteCtx) => Promise<Response> | Response,
) {
  return async (req: NextRequest, ctx: RouteCtx): Promise<Response> => {
    const session = await requireAdmin()
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return handler(session, req, ctx)
  }
}
