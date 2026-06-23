import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Unauthenticated liveness/readiness probe. Returns 200 only when the app has
// booted AND can reach the database, so a deploy can be verified as actually
// healthy (not just "the port is open"). Wired into proxy.ts PUBLIC_PATHS so it
// is never redirected to /login, and into the Cloud Run startup probe.
//
// Must always run the DB check — never cache or statically optimize.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok', db: 'up' }, { status: 200 })
  } catch (err) {
    console.error('[GET /api/health] database unreachable', err)
    return NextResponse.json({ status: 'error', db: 'down' }, { status: 503 })
  }
}
