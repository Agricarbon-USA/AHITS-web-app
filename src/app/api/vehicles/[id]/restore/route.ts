import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'

// POST /api/vehicles/[id]/restore — PR-5, the vehicle twin of PR-3c's item Restore.
// Behind the "Undo" on the delete toast and "Show deleted → Restore". Vehicle DELETE
// only stamps `deletedAt` (and resolves the vehicle's alerts), so Restore is exact:
// clear the stamp. The name is globally unique and stays reserved while deleted, and
// the QR label stays bound, so nothing can collide. Alerts the vehicle still
// qualifies for (e.g. an expiring registration) re-raise on the next cron (D-i).
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const { count } = await prisma.vehicle.updateMany({
    where: { id, deletedAt: { not: null } },
    data: { deletedAt: null },
  })
  if (count === 0) return NextResponse.json({ error: 'Vehicle not found or not deleted' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
