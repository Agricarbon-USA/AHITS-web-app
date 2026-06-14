import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { hashPin } from '@/lib/auth/pin'

const patchSchema = z.object({
  name: z.string().optional(),
  isActive: z.boolean().optional(),
  pin: z.string().length(6).regex(/^\d{6}$/).optional(),
}).and(z.object({ unlockPin: z.boolean().optional() }))

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const parsed = patchSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { pin, unlockPin, ...rest } = parsed.data
  const data: Record<string, unknown> = { ...rest }
  if (pin) data.pinHash = await hashPin(pin)
  if (unlockPin) { data.pinLockedAt = null; data.failedPinAttempts = 0 }

  const user = await prisma.user.update({ where: { id }, data })
  const { pinHash: _, ...safeUser } = user
  return NextResponse.json({ data: safeUser })
}
