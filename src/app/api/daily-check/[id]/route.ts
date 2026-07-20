import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'

// CC-26: read-only single daily-check for the admin viewer (and an operator viewing
// their own). Returns the FULL contents — checklist answers, odometer, site, issues,
// photos (with per-photo GPS), duration. Pure read; there is no write path here.
// DailyCheck has no check-level GPS columns yet (CC-15 adds them); the viewer renders
// per-photo `gpsLat`/`gpsLng` today and is absent-safe for the check-level slot.
// Cached offline via the existing `/api/daily-check` SW field-read prefix.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const check = await prisma.dailyCheck.findUnique({
    where: { id },
    include: {
      operator: { select: { id: true, name: true } },
      vehicle: { select: { id: true, name: true, type: true } },
      photos: { orderBy: { takenAt: 'desc' } },
    },
  })
  if (!check) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Operator-view scoping (mirrors the list route): an operator may read ONLY their own
  // checks; admins read any. The viewer's callers are admin surfaces, but this keeps the
  // endpoint safe if an operator hits it directly.
  if (session.role !== 'ADMIN' && check.operatorId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ data: check })
}
