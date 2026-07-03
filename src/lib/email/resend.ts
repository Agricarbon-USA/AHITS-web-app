import { Resend } from 'resend'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'

function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY is not set')
  return new Resend(key)
}

/** Truthy EMAIL_SANDBOX → non-production; set it on every non-prod environment. */
function isSandbox() {
  const v = process.env.EMAIL_SANDBOX
  return v === '1' || v === 'true' || v === 'TRUE'
}

export type EmailKind =
  | 'INVITE'
  | 'WORK_ORDER'
  | 'HUB_RETURN'
  | 'RESERVATION'
  | 'ALERT'
  | 'INVOICE'
  | 'OTHER'

type EmailStatus = 'SENT' | 'FAILED' | 'SKIPPED'
const MAX_ATTEMPTS = 3
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * FND-8: persist a delivery record for every outbound email attempt. Written via
 * raw SQL (the email_logs table ships in migration 20260703000000_add_email_log).
 * Logging must never break sending, so failures here are swallowed to the console.
 */
async function logEmail(row: {
  to: string
  subject: string
  kind: EmailKind
  status: EmailStatus
  attempts: number
  lastError?: string | null
  providerId?: string | null
  sentAt?: Date | null
}) {
  try {
    await prisma.$executeRaw`
      INSERT INTO "email_logs"
        ("id", "to", "subject", "kind", "status", "attempts", "lastError", "providerId", "sentAt", "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${row.to}, ${row.subject}, ${row.kind},
              ${row.status}::"EmailStatus", ${row.attempts}, ${row.lastError ?? null},
              ${row.providerId ?? null}, ${row.sentAt ?? null}, now(), now())
    `
  } catch (e) {
    console.error('[email] failed to write EmailLog', e)
  }
}

/**
 * Send an email — with a non-prod sandbox guard, a small retry, and a durable
 * delivery log (FND-8 / H-NOTIF3).
 *
 * Production (EMAIL_SANDBOX unset/falsey) contacts the real recipient. When
 * EMAIL_SANDBOX is set, real recipients (external shops, hubs, invoiced operators
 * on the live agricarbon.com from-domain) are NEVER contacted: with
 * EMAIL_SANDBOX_TO the message is redirected to that test inbox; without it the
 * send is skipped (logged as SKIPPED).
 *
 * Transient failures are retried up to MAX_ATTEMPTS. Every outcome (SENT/FAILED/
 * SKIPPED) is written to email_logs so a failed send is surfaced to admins instead
 * of vanishing. The function still THROWS on final failure, preserving the
 * existing caller contract (e.g. the invite route's dangling-invite cleanup + 502).
 */
export async function sendEmail({
  to,
  subject,
  html,
  kind = 'OTHER',
}: {
  to: string | string[]
  subject: string
  html: string
  kind?: EmailKind
}) {
  const toStr = Array.isArray(to) ? to.join(', ') : to
  let effectiveTo: string | string[] = to
  let effectiveSubject = subject

  if (isSandbox()) {
    const redirect = process.env.EMAIL_SANDBOX_TO
    if (!redirect) {
      await logEmail({ to: toStr, subject, kind, status: 'SKIPPED', attempts: 0, lastError: 'EMAIL_SANDBOX on; no EMAIL_SANDBOX_TO — send skipped' })
      console.warn(`[email] EMAIL_SANDBOX on, no EMAIL_SANDBOX_TO — skipped send to [${toStr}]: ${subject}`)
      return null
    }
    effectiveTo = redirect
    effectiveSubject = `[SANDBOX → ${toStr}] ${subject}`
  }

  let lastError: string | null = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { data, error } = await getResend().emails.send({
        from: process.env.EMAIL_FROM ?? 'AHITS <noreply@agricarbon.com>',
        to: effectiveTo,
        subject: effectiveSubject,
        html,
      })
      if (error) throw new Error(`Resend error: ${error.message}`)
      await logEmail({ to: toStr, subject, kind, status: 'SENT', attempts: attempt, providerId: data?.id ?? null, sentAt: new Date() })
      return data
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      if (attempt < MAX_ATTEMPTS) {
        await sleep(250 * attempt)
        continue
      }
    }
  }

  // Every attempt failed: record it (so it is not silently swallowed) then rethrow.
  await logEmail({ to: toStr, subject, kind, status: 'FAILED', attempts: MAX_ATTEMPTS, lastError })
  throw new Error(lastError ?? 'Email send failed')
}
