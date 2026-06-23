import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { withIdempotency } from '@/lib/idempotency'
import { resolveStatusLink, applyTransition } from '@/lib/status-links'

const schema = z.object({
  action: z.string().min(1),
  actorLabel: z.string().min(1, 'Please enter your name'),
  note: z.string().optional(),
})

// Public, token-gated transition. Idempotent (a double-tap / email prefetch can't
// double-apply) and rate-limited.
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  return withIdempotency(req, 'statuslink.transition.POST', () => _POST(req, ctx))
}

async function _POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const ip = clientIp(req)
  const rl = rateLimit(`statuslink:${ip}`, 60, 5 * 60 * 1000)
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const link = await resolveStatusLink(token)
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await applyTransition(link, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ ok: true, state: result.state })
}
