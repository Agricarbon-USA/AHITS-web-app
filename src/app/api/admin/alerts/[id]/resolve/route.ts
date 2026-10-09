import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeOr404 } from '@/lib/api-errors'
import { withAdmin } from '@/lib/route-helpers'
import { markAlertNotificationsRead } from '@/lib/alerts'

// W0-8 exemplar: uses the shared withAdmin wrapper.
export const POST = withAdmin(async (_session, _req, { params }) => {
  const { id } = await params
  // Guard a stale/guessed id → clean 404 instead of an unhandled 500 (W0-8).
  // PR-4 (D-i · P-8): resolving also marks the alert's bell rows read — in one transaction.
  const notFound = await writeOr404(
    () => prisma.$transaction(async (tx) => {
      await tx.alert.update({
        where: { id },
        // Null activeKey on resolve so the partial-unique dedup frees up: a later
        // recurrence of the same issue can create a fresh unresolved alert. (CR-5)
        data: { resolved: true, resolvedAt: new Date(), activeKey: null },
      })
      await markAlertNotificationsRead([id], tx)
    }),
    'Alert not found',
  )
  if (notFound) return notFound
  return NextResponse.json({ ok: true })
})
