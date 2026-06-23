import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  await prisma.alert.update({
    where: { id },
    // Null activeKey on resolve so the partial-unique dedup frees up: a later
    // recurrence of the same issue can create a fresh unresolved alert. (CR-5)
    data: { resolved: true, resolvedAt: new Date(), activeKey: null },
  })
  return NextResponse.json({ ok: true })
}
