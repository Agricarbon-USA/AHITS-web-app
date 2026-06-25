import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireAdmin } from '@/lib/auth/session'

export async function GET() {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hubs = await prisma.hub.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  })
  // M6: merge in the email column (raw — newer than the generated client).
  // Best-effort so a pre-migration DB still returns hubs without email.
  let emailById = new Map<string, string | null>()
  try {
    const rows = await prisma.$queryRaw<{ id: string; email: string | null }[]>`SELECT "id", "email" FROM "hubs"`
    emailById = new Map(rows.map((r) => [r.id, r.email]))
  } catch { /* column missing pre-migration */ }
  return NextResponse.json(hubs.map((h) => ({ ...h, email: emailById.get(h.id) ?? null })))
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, city, state, email } = await req.json()
  if (!name?.trim() || !city?.trim() || !state?.trim()) {
    return NextResponse.json({ error: 'Name, city, and state are required' }, { status: 400 })
  }
  const trimmedEmail = typeof email === 'string' ? email.trim() : ''
  if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
    return NextResponse.json({ error: 'Enter a valid hub contact email or leave it blank.' }, { status: 400 })
  }

  const hub = await prisma.hub.create({
    data: { name: name.trim(), city: city.trim(), state: state.trim().toUpperCase() },
  })
  // M6: persist the email via raw SQL (column newer than the generated client).
  if (trimmedEmail) {
    await prisma.$executeRaw`UPDATE "hubs" SET "email" = ${trimmedEmail} WHERE "id" = ${hub.id}`
  }
  return NextResponse.json({ ...hub, email: trimmedEmail || null }, { status: 201 })
}
