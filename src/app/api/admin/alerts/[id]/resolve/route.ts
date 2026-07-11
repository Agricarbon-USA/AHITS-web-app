import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeOr404 } from '@/lib/api-errors'
import { withAdmin } from '@/lib/route-helpers'

// W0-8 exemplar: uses the shared withAdmin wrapper.
export const POST = withAdmin(async (_session, _req, { params }) => {
  const { id } = await params
  // Guard a stale/guessed id → clean 404 instead of an unhandled 500 (W0-8).
  const notFound = await writeOr404(
    () => prisma.alert.update({
      where: { id },
      // Null activeKey on resolve so the partial-unique dedup frees up: a later
      // recurrence of the same issue can create a fresh unresolved alert. (CR-5)
      data: { resolved: true, resolvedAt: new Date(), activeKey: null },
    }),
    'Alert not found',
  )
  if (notFound) return notFound
  return NextResponse.json({ ok: true })
})
