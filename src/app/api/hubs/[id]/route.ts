import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { writeOr404, isRecordNotFound } from '@/lib/api-errors'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { name, city, state, email, street1, street2, zip, country } = await req.json()
  if (!name?.trim() || !city?.trim() || !state?.trim()) {
    return NextResponse.json({ error: 'Name, city, and state are required' }, { status: 400 })
  }
  const trimmedEmail = typeof email === 'string' ? email.trim() : ''
  if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
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

  let hub
  try {
    hub = await prisma.hub.update({
      where: { id },
      data: { name: name.trim(), city: city.trim(), state: state.trim().toUpperCase() },
    })
  } catch (err) {
    if (isRecordNotFound(err)) return NextResponse.json({ error: 'Hub not found' }, { status: 404 })
    throw err
  }
  await prisma.$executeRaw`
    UPDATE "hubs"
    SET "email" = ${trimmedEmail || null},
        "street1" = ${trimmedStreet1 || null},
        "street2" = ${trimmedStreet2 || null},
        "zip" = ${trimmedZip || null},
        "country" = ${trimmedCountry || 'US'}
    WHERE "id" = ${id}
  `
  return NextResponse.json({ ...hub, email: trimmedEmail || null, street1: trimmedStreet1 || null, street2: trimmedStreet2 || null, zip: trimmedZip || null, country: trimmedCountry || 'US' })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  // Soft-delete: mark inactive rather than hard delete
  const notFound = await writeOr404(() => prisma.hub.update({ where: { id }, data: { isActive: false } }), 'Hub not found')
  if (notFound) return notFound
  return new NextResponse(null, { status: 204 })
}
