import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { deleteItem } from '@/lib/asset-status'
import { referenceConflictBody } from '@/lib/asset-references'

const bodySchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) })

// POST /api/inventory/bulk-delete — PR-3c (D-p): "Delete selected". Each item is
// deleted in its OWN transaction, so one refusal never blocks the rest; the answer
// is per item, with the guard's reason for each refusal.
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Send 1–100 item ids.' }, { status: 400 })

  const ids = [...new Set(parsed.data.ids)]
  const names = new Map(
    (await prisma.inventoryItem.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }))
      .map((i) => [i.id, i.name]),
  )
  const results: { id: string; name: string; ok: boolean; error?: string }[] = []
  for (const id of ids) {
    const name = names.get(id) ?? 'Unknown item'
    try {
      const deleted = await prisma.$transaction((tx) => deleteItem(tx, id, session.userId))
      results.push(deleted ? { id, name, ok: true } : { id, name, ok: false, error: 'Not found or already deleted.' })
    } catch (err) {
      const conflict = referenceConflictBody(err)
      results.push({ id, name, ok: false, error: conflict?.error ?? 'Could not delete — try again.' })
    }
  }
  return NextResponse.json({ results })
}
