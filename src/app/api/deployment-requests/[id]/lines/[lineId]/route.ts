import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/session'
import { setLineFulfillment } from '@/lib/deployment-requests'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  action: z.enum(['confirm', 'edit', 'deny']),
  fulfilledQty: z.number().int().positive().optional(),
  resolvedUnitId: z.string().optional(),
  resolvedVehicleId: z.string().optional(),
  substitutedItemId: z.string().optional(),
  denyReason: z.string().optional(),
  stagedCondition: z.string().optional(),
  note: z.string().optional(),
})

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; lineId: string }> },
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Admin only.' }, { status: 403 })

  const { id: requestId, lineId } = await ctx.params

  // Verify ownership: lineId must belong to requestId.
  const ownership = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(*)::bigint AS cnt FROM "deployment_request_lines"
    WHERE "id" = ${lineId} AND "requestId" = ${requestId}
  `
  if (Number(ownership[0]?.cnt ?? 0) === 0) {
    return NextResponse.json({ error: 'Line not found.' }, { status: 404 })
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { action, ...fields } = parsed.data
  const status: 'CONFIRMED' | 'EDITED' | 'DENIED' =
    action === 'confirm' ? 'CONFIRMED' : action === 'edit' ? 'EDITED' : 'DENIED'

  const result = await setLineFulfillment(lineId, {
    status,
    ...fields,
    actor: { userId: session.userId },
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
