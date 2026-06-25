import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'

const schema = z.object({ id: z.string().optional(), all: z.boolean().optional() })

// Mark one notification (by id) or all of the user's notifications as read.
export async function POST(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const now = new Date()
  if (parsed.data.all) {
    await prisma.notification.updateMany({
      where: { userId: session.userId, readAt: null },
      data: { readAt: now },
    })
  } else if (parsed.data.id) {
    // updateMany scoped to userId so a user can't mark someone else's read.
    await prisma.notification.updateMany({
      where: { id: parsed.data.id, userId: session.userId },
      data: { readAt: now },
    })
  }

  return NextResponse.json({ ok: true })
}
