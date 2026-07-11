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
  // Merge in columns newer than the generated client (email, address fields).
  // Best-effort so a pre-migration DB still returns hubs without these fields.
  type ExtraRow = { id: string; email: string | null; street1: string | null; street2: string | null; zip: string | null; country: string | null }
  let extraById = new Map<string, ExtraRow>()
  try {
    const rows = await prisma.$queryRaw<ExtraRow[]>`SELECT "id", "email", "street1", "street2", "zip", "country" FROM "hubs"`
    extraById = new Map(rows.map((r) => [r.id, r]))
  } catch { /* columns missing pre-migration */ }
  // FND-33: return a { data } envelope so success and error (401/500 → { error })
  // are both objects. Every consumer is shape-tolerant (Array.isArray(d) ? d : d.data).
  return NextResponse.json({ data: hubs.map((h) => {
    const extra = extraById.get(h.id)
    return { ...h, email: extra?.email ?? null, street1: extra?.street1 ?? null, street2: extra?.street2 ?? null, zip: extra?.zip ?? null, country: extra?.country ?? 'US' }
  }) })
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, city, state, email, street1, street2, zip, country } = await req.json()
  if (!name?.trim() || !city?.trim() || !state?.trim()) {
    return NextResponse.json({ error: 'Name, city, and state are required' }, { status: 400 })
  }
  const trimmedEmail = typeof email === 'string' ? email.trim() : ''
  if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
    return NextResponse.json({ error: 'Enter a valid hub contact email or leave it blank.' }, { status: 400 })
  }
  const trimmedStreet1 = typeof street1 === 'string' ? street1.trim() : ''
  const trimmedStreet2 = typeof street2 === 'string' ? street2.trim() : ''
  const trimmedZip = typeof zip === 'string' ? zip.trim() : ''
  const trimmedCountry = typeof country === 'string' ? country.trim().toUpperCase() : 'US'
  if (trimmedStreet1) {
    if (!trimmedZip) return NextResponse.json({ error: 'Zip is required when a street address is set.' }, { status: 400 })
    if (trimmedCountry && trimmedCountry.length !== 2) return NextResponse.json({ error: 'Country must be a 2-letter code (e.g. US).' }, { status: 400 })
  }

  const hub = await prisma.hub.create({
    data: { name: name.trim(), city: city.trim(), state: state.trim().toUpperCase() },
  })
  await prisma.$executeRaw`
    UPDATE "hubs"
    SET "email" = ${trimmedEmail || null},
        "street1" = ${trimmedStreet1 || null},
        "street2" = ${trimmedStreet2 || null},
        "zip" = ${trimmedZip || null},
        "country" = ${trimmedCountry || 'US'}
    WHERE "id" = ${hub.id}
  `
  return NextResponse.json({ ...hub, email: trimmedEmail || null, street1: trimmedStreet1 || null, street2: trimmedStreet2 || null, zip: trimmedZip || null, country: trimmedCountry || 'US' }, { status: 201 })
}
