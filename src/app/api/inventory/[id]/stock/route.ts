import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireAdmin } from '@/lib/auth/session'
import { listItemStock, setStockAtHub, drawFromHub, restoreToHub, resyncItemTotal } from '@/lib/inventory-stock'

const setSchema = z.object({
  hubId: z.string().min(1),
  quantity: z.number().int().min(0),
})

const moveSchema = z.object({
  fromHubId: z.string().min(1),
  toHubId: z.string().min(1),
  qty: z.number().int().min(1),
})

const bodySchema = z.union([setSchema, moveSchema])

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const stock = await listItemStock(id)
  return NextResponse.json({ data: stock })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })

  const body = parsed.data

  if ('fromHubId' in body) {
    // Move: draw from source, restore to destination inside a transaction
    const { fromHubId, toHubId, qty } = body
    const result = await prisma.$transaction(async (tx) => {
      const drawn = await drawFromHub(id, fromHubId, qty, tx)
      if (drawn < qty) return { ok: false, drawn }
      await restoreToHub(id, toHubId, qty, tx)
      await resyncItemTotal(id, tx)
      return { ok: true, drawn }
    })
    if (!result.ok) {
      return NextResponse.json(
        { error: 'INSUFFICIENT_HUB_STOCK', detail: `Only ${result.drawn} available at source hub` },
        { status: 409 },
      )
    }
  } else {
    // Set: overwrite hub stock then re-sync item total
    const { hubId, quantity } = body
    await prisma.$transaction(async (tx) => {
      await setStockAtHub(id, hubId, quantity, tx)
      await resyncItemTotal(id, tx)
    })
  }

  const stock = await listItemStock(id)
  return NextResponse.json({ data: stock })
}
