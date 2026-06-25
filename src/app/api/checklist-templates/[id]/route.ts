import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/session'
import { updateChecklistTemplate, deleteChecklistTemplate, VEHICLE_TYPES } from '@/lib/checklist-templates'

const itemSchema = z.object({ key: z.string().optional(), label: z.string().min(1) })
const bodySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  vehicleType: z.enum(VEHICLE_TYPES).nullable(),
  items: z.array(itemSchema).min(1, 'Add at least one checklist item'),
  isActive: z.boolean(),
})

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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  await updateChecklistTemplate(id, {
    name: parsed.data.name.trim(),
    vehicleType: parsed.data.vehicleType,
    items: withKeys(parsed.data.items),
    isActive: parsed.data.isActive,
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  await deleteChecklistTemplate(id)
  return new NextResponse(null, { status: 204 })
}
