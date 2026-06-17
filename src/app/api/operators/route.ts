import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'

// GET /api/operators
// Minimal roster of active operators, readable by ANY authenticated user.
// The operator Transfer flow needs to pick a destination operator, but the full
// /api/users endpoint is admin-only (403 for operators) — so the destination
// dropdown was always empty and operators could never transfer equipment.
// Returns only non-sensitive fields (no email, PIN hash, etc.).
export async function GET() {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await prisma.user.findMany({
    where: { role: 'OPERATOR', isActive: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ data })
}
