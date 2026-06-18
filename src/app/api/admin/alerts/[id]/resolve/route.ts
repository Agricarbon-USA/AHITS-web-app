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
    // Clear activeKey on resolve (DAT-7) so the dedup constraint frees up — a new
    // alert for the same source can be raised once this one is resolved.
    data: { resolved: true, resolvedAt: new Date(), activeKey: null },
  })
  return NextResponse.json({ ok: true })
}
