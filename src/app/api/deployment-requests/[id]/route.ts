import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/session'
import { getRequest, transitionRequest } from '@/lib/deployment-requests'

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

const patchSchema = z.object({ action: z.enum(['submit', 'cancel']) })

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const result = await getRequest(id)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.role !== 'ADMIN' && result.requestedById !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ok = await transitionRequest(id, parsed.data.action)
  if (!ok) {
    return NextResponse.json(
      { error: parsed.data.action === 'submit' ? 'Only a draft can be submitted.' : 'This request can no longer be cancelled.' },
      { status: 409 },
    )
  }
  return NextResponse.json({ ok: true })
}
