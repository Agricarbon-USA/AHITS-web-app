import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { isUniqueViolation } from '@/lib/api-errors'
import { requireAdmin } from '@/lib/auth/session'
import { hashPin } from '@/lib/auth/pin'
import { writeAudit } from '@/lib/audit'
import { pinSchema, money } from '@/lib/validation'
import { getActiveProjectsForOperators } from '@/lib/project-associations'

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const users = await prisma.user.findMany({
    select: {
      id: true, name: true, email: true, role: true, isActive: true,
      lastLoginAt: true, failedPinAttempts: true, pinLockedAt: true,
      mustChangePin: true, hourlyRate: true, homeHubId: true,
      homeHub: { select: { id: true, name: true } },
    },
    orderBy: { name: 'asc' },
  })
  const operatorIds = users.filter((u) => u.role === 'OPERATOR').map((u) => u.id)
  const projectMap = await getActiveProjectsForOperators(operatorIds)
  return NextResponse.json({
    data: users.map((u) => ({
      ...u,
      activeProjects: u.role === 'OPERATOR' ? (projectMap.get(u.id) ?? []) : [],
    })),
  })
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'OPERATOR']),
  pin: pinSchema,
  homeHubId: z.string().nullable().optional(),
  hourlyRate: money().nullable().optional(),
})

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { pin, ...rest } = parsed.data
  const pinHash = await hashPin(pin)
  let user
  try {
    user = await prisma.user.create({ data: { ...rest, pinHash } })
  } catch (err) {
    if (isUniqueViolation(err)) return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 409 })
    throw err
  }
  await writeAudit(session.userId, 'BULK_IMPORT', user.id, { via: 'direct-create', email: user.email, role: user.role })
  const { pinHash: _, ...safeUser } = user
  return NextResponse.json({ data: safeUser }, { status: 201 })
}
