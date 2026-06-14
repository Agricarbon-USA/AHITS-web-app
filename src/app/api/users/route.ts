import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { hashPin } from '@/lib/auth/pin'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, failedPinAttempts: true, pinLockedAt: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ data: users })
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'OPERATOR']),
  pin: z.string().length(6).regex(/^\d{6}$/),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { pin, ...rest } = parsed.data
  const pinHash = await hashPin(pin)
  const user = await prisma.user.create({ data: { ...rest, pinHash } })
  const { pinHash: _, ...safeUser } = user
  return NextResponse.json({ data: safeUser }, { status: 201 })
}
