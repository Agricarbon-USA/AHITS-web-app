import { Resend } from 'resend'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { resolveAlertsFor } from '@/lib/alerts'

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

type EmailStatus = 'SENT' | 'FAILED' | 'SKIPPED' | 'REDIRECTED'

/**
 * PR-4 (D-j): what actually happened to a message.
 *   SENT       — delivered to the real recipient (`deliveredTo` = `to`)
 *   REDIRECTED — the sandbox delivered it to EMAIL_SANDBOX_TO instead; the real
 *                recipient did NOT get it
 *   SKIPPED    — nothing was sent (sandbox with no redirect inbox, or no address)
 *   FAILED     — every attempt failed (sendEmail throws; `tryEmail` maps it)
 */
export type EmailOutcome = 'SENT' | 'REDIRECTED' | 'SKIPPED' | 'FAILED'
export type SkipReason = 'SANDBOX' | 'NO_RECIPIENT'
export interface EmailResult {
  outcome: Exclude<EmailOutcome, 'FAILED'>
  deliveredTo: string | null
  logId: string | null
  skipReason?: SkipReason
}
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
  deliveredTo?: string | null
  lastError?: string | null
  providerId?: string | null
  sentAt?: Date | null
}): Promise<string | null> {
  const id = randomUUID()
  try {
    await prisma.$executeRaw`
      INSERT INTO "email_logs"
        ("id", "to", "subject", "kind", "status", "deliveredTo", "attempts", "lastError", "providerId", "sentAt", "createdAt", "updatedAt")
      VALUES (${id}, ${row.to}, ${row.subject}, ${row.kind},
              ${row.status}::"EmailStatus", ${row.deliveredTo ?? null}, ${row.attempts}, ${row.lastError ?? null},
              ${row.providerId ?? null}, ${row.sentAt ?? null}, now(), now())
    `
    return id
  } catch (e) {
    console.error('[email] failed to write EmailLog', e)
    return null
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
 * send is skipped.
 *
 * PR-4 (D-j · P-1): returns what actually happened — `{ outcome, deliveredTo, logId }`
 * — and the log row records the real status and `deliveredTo`. A sandbox redirect is
 * REDIRECTED to the sandbox inbox, not "SENT" to the real recipient (which is what it
 * used to log). Still THROWS on final failure, preserving the caller contract the
 * invite route's dangling-invite cleanup depends on; `tryEmail` maps the throw to
 * FAILED for callers that report outcomes. `retryOf: <logId>` marks this as a resend
 * of a failed message: on success, that row's EMAIL_FAILED alert resolves (P-13).
 */
export async function sendEmail({
  to,
  subject,
  html,
  kind = 'OTHER',
  retryOf,
}: {
  to: string | string[]
  subject: string
  html: string
  kind?: EmailKind
  retryOf?: string
}): Promise<EmailResult> {
  const toStr = Array.isArray(to) ? to.join(', ') : to
  let effectiveTo: string | string[] = to
  let effectiveSubject = subject
  let redirected = false

  if (isSandbox()) {
    const redirect = process.env.EMAIL_SANDBOX_TO
    if (!redirect) {
      const logId = await logEmail({ to: toStr, subject, kind, status: 'SKIPPED', attempts: 0, lastError: 'EMAIL_SANDBOX on; no EMAIL_SANDBOX_TO — send skipped' })
      console.warn(`[email] EMAIL_SANDBOX on, no EMAIL_SANDBOX_TO — skipped send to [${toStr}]: ${subject}`)
      return { outcome: 'SKIPPED', deliveredTo: null, logId, skipReason: 'SANDBOX' }
    }
    effectiveTo = redirect
    effectiveSubject = `[SANDBOX → ${toStr}] ${subject}`
    redirected = true
  }
  const deliveredTo = Array.isArray(effectiveTo) ? effectiveTo.join(', ') : effectiveTo

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
      const outcome = redirected ? 'REDIRECTED' : 'SENT'
      const logId = await logEmail({ to: toStr, subject, kind, status: outcome, deliveredTo, attempts: attempt, providerId: data?.id ?? null, sentAt: new Date() })
      if (retryOf) await resolveAlertsFor('email_logs', retryOf).catch(() => {})
      return { outcome, deliveredTo, logId }
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

/** The outcome a route reports — FAILED instead of a throw, SKIPPED when there is no address. */
export interface ReportedEmail {
  outcome: EmailOutcome
  deliveredTo: string | null
  skipReason?: SkipReason
}

/**
 * PR-4 (D-j): send and report — for routes that tell the admin where a message
 * went. No address → SKIPPED (NO_RECIPIENT) without trying; a final failure →
 * FAILED instead of a throw. Callers that must react to a failure (the invite
 * route's cleanup) keep calling `sendEmail` directly.
 */
export async function tryEmail(args: Omit<Parameters<typeof sendEmail>[0], 'to'> & { to: string | string[] | null | undefined }): Promise<ReportedEmail> {
  if (!args.to || (Array.isArray(args.to) && args.to.length === 0)) {
    return { outcome: 'SKIPPED', deliveredTo: null, skipReason: 'NO_RECIPIENT' }
  }
  try {
    const r = await sendEmail({ ...args, to: args.to })
    return { outcome: r.outcome, deliveredTo: r.deliveredTo, ...(r.skipReason && { skipReason: r.skipReason }) }
  } catch {
    return { outcome: 'FAILED', deliveredTo: null }
  }
}
