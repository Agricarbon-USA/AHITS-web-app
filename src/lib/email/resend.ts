import { Resend } from 'resend'

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

/**
 * Send an email — with a non-prod sandbox guard.
 *
 * Production (EMAIL_SANDBOX unset/falsey) is unchanged. When EMAIL_SANDBOX is set,
 * real recipients — which include external repair shops, hubs, and invoiced
 * operators, all on the live agricarbon.com from-domain — are NEVER contacted:
 *   • EMAIL_SANDBOX_TO set  → redirect the message to that test inbox, with the
 *     original recipients tagged into the subject so QA can still verify delivery;
 *   • EMAIL_SANDBOX_TO unset → skip the send entirely and log it.
 * Closes H-NOTIF3 — HUB_RETURN auto-fires on a disposition with no explicit send
 * click, so a QA action on staging could otherwise email a real hub contact.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string | string[]
  subject: string
  html: string
}) {
  let effectiveTo: string | string[] = to
  let effectiveSubject = subject

  if (isSandbox()) {
    const original = Array.isArray(to) ? to.join(', ') : to
    const redirect = process.env.EMAIL_SANDBOX_TO
    if (!redirect) {
      console.warn(`[email] EMAIL_SANDBOX on, no EMAIL_SANDBOX_TO — skipped send to [${original}]: ${subject}`)
      return null
    }
    effectiveTo = redirect
    effectiveSubject = `[SANDBOX → ${original}] ${subject}`
  }

  const { data, error } = await getResend().emails.send({
    from: process.env.EMAIL_FROM ?? 'AHITS <noreply@agricarbon.com>',
    to: effectiveTo,
    subject: effectiveSubject,
    html,
  })

  if (error) {
    throw new Error(`Resend error: ${error.message}`)
  }

  return data
}
