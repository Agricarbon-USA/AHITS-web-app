import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireAdmin } from '@/lib/auth/session'
import {
  listChecklistTemplates, createChecklistTemplate, resolveChecklistItems, VEHICLE_TYPES,
} from '@/lib/checklist-templates'

const itemSchema = z.object({ key: z.string().optional(), label: z.string().min(1) })
const bodySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  vehicleType: z.enum(VEHICLE_TYPES).nullable(),
  items: z.array(itemSchema).min(1, 'Add at least one checklist item'),
})

// Derive a stable slug key from a label when the client doesn't supply one, and
// guarantee uniqueness within the template so two same-named items don't collide.
function withKeys(items: { key?: string; label: string }[]) {
  const seen = new Set<string>()
  return items.map((it, idx) => {
    let key = (it.key && it.key.trim())
      || it.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      || `item_${idx}`
    while (seen.has(key)) key = `${key}_${idx}`
    seen.add(key)
    return { key, label: it.label.trim() }
  })
}

export async function GET(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Operator path: resolve the effective checklist for a vehicle type. Any
  // authenticated user may read this (it carries no sensitive data).
  const vehicleType = req.nextUrl.searchParams.get('vehicleType')
  if (vehicleType !== null) {
    const items = await resolveChecklistItems(vehicleType)
    return NextResponse.json({ items }) // items === null → caller uses the built-in default
  }

  // Admin path: full list for the editor.
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json({ data: await listChecklistTemplates() })
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const id = await createChecklistTemplate({
    name: parsed.data.name.trim(),
    vehicleType: parsed.data.vehicleType,
    items: withKeys(parsed.data.items),
  })
  return NextResponse.json({ id }, { status: 201 })
}
