import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { restoreItem } from '@/lib/asset-status'

// POST /api/inventory/[id]/restore — PR-3c (D-o): bring a deleted item back exactly —
// the item, and the units and schedules deleted with it (same stamp). Behind the
// "Undo" on the delete toast and the "Show deleted → Restore" action.
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const restored = await prisma.$transaction((tx) => restoreItem(tx, id))
  if (!restored) return NextResponse.json({ error: 'Item not found or not deleted' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
