import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/session'
import { getRequest, applyRequestTransition, type RequestAction } from '@/lib/deployment-requests'

const ADMIN_ONLY_ACTIONS = ['confirm', 'prepare', 'decline', 'fulfill', 'forward', 'complete'] as const

const patchSchema = z.object({
  action: z.enum(['submit', 'cancel', 'confirm', 'prepare', 'decline', 'fulfill', 'forward', 'complete']),
  decisionNote: z.string().trim().max(2000).optional().nullable(),
  fulfillerHubId: z.string().optional().nullable(),
  fulfillerOperatorId: z.string().optional().nullable(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const result = await getRequest(id)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Operators may only read their own requests.
  if (session.role !== 'ADMIN' && result.requestedById !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json({ data: { request: result.request, lines: result.lines } })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { action, ...extra } = parsed.data
  const isAdminOnly = (ADMIN_ONLY_ACTIONS as readonly string[]).includes(action)

  if (isAdminOnly && session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only.' }, { status: 403 })
  }

  const result = await getRequest(id)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Operators without admin role may only act on their own requests.
  if (!isAdminOnly && session.role !== 'ADMIN' && result.requestedById !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ok = await applyRequestTransition(id, action as RequestAction, result.request.requestType, extra)
  if (!ok) {
    const msg =
      action === 'submit'
        ? 'Only a draft can be submitted.'
        : 'Transition not allowed in the current state.'
    return NextResponse.json({ error: msg }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}
