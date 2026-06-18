import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { sendEmail } from '@/lib/email/resend'
import { inviteEmail } from '@/lib/email/templates'
import { writeAudit } from '@/lib/audit'

// Bulk-onboard operators by emailing invites (Wave 2A.5 §B.3). Each row creates
// a CSPRNG invite token; a fresh user sets their own PIN via the invite flow.
const rowSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'OPERATOR']).default('OPERATOR'),
})
const schema = z.object({ rows: z.array(rowSchema).min(1).max(200) })

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const results: { email: string; ok: boolean; error?: string }[] = []

  for (const row of parsed.data.rows) {
    try {
      const existing = await prisma.user.findUnique({ where: { email: row.email } })
      if (existing) {
        results.push({ email: row.email, ok: false, error: 'User already exists' })
        continue
      }
      await prisma.inviteToken.deleteMany({ where: { email: row.email, usedAt: null } })
      const invite = await prisma.inviteToken.create({
        data: {
          email: row.email,
          name: row.name,
          role: row.role,
          token: randomBytes(32).toString('base64url'),
          createdBy: session.userId,
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      })
      const setupUrl = `${appUrl}/setup-account?token=${encodeURIComponent(invite.token)}`
      await sendEmail({
        to: row.email,
        subject: `You've been invited to AHITS — Agricarbon`,
        html: inviteEmail(row.name, row.role, setupUrl),
      })
      results.push({ email: row.email, ok: true })
    } catch (err) {
      console.error('bulk invite row failed', row.email, err)
      results.push({ email: row.email, ok: false, error: 'Failed to send invite' })
    }
  }

  const sent = results.filter((r) => r.ok).length
  await writeAudit(session.userId, 'BULK_IMPORT', null, { requested: parsed.data.rows.length, sent })
  return NextResponse.json({ data: { sent, total: parsed.data.rows.length, results } })
}
