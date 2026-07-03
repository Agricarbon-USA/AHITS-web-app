import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'

interface EmailLogRow {
  id: string
  to: string
  subject: string
  kind: string
  status: string
  attempts: number
  lastError: string | null
  providerId: string | null
  sentAt: Date | null
  createdAt: Date
}

// FND-8: admin visibility into email deliveries so a swallowed shop/hub/invite/
// invoice/alert send can be seen and re-actioned. Read-only, admin-only. Returns
// the 50 most recent (optionally filtered by ?status=FAILED|SENT|SKIPPED) plus a
// 7-day status summary for the compact Settings surface.
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const statusParam = req.nextUrl.searchParams.get('status')
  const status = statusParam && ['SENT', 'FAILED', 'SKIPPED'].includes(statusParam) ? statusParam : null

  const rows = status
    ? await prisma.$queryRaw<EmailLogRow[]>`
        SELECT "id", "to", "subject", "kind", "status"::text AS "status", "attempts",
               "lastError", "providerId", "sentAt", "createdAt"
        FROM "email_logs" WHERE "status" = ${status}::"EmailStatus"
        ORDER BY "createdAt" DESC LIMIT 50`
    : await prisma.$queryRaw<EmailLogRow[]>`
        SELECT "id", "to", "subject", "kind", "status"::text AS "status", "attempts",
               "lastError", "providerId", "sentAt", "createdAt"
        FROM "email_logs" ORDER BY "createdAt" DESC LIMIT 50`

  const counts = await prisma.$queryRaw<{ status: string; n: number }[]>`
    SELECT "status"::text AS "status", COUNT(*)::int AS "n"
    FROM "email_logs" WHERE "createdAt" > now() - interval '7 days'
    GROUP BY "status"`

  return NextResponse.json({ data: rows, counts })
}
