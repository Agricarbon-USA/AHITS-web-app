// PR-4 (D-j · P-1 / U-5 / U-13): the one wording for "what happened to that email",
// shared by every toast and badge that used to say "emailed" / "resent" / "sent"
// whatever actually happened. Client-safe: no server imports.

export type EmailOutcome = 'SENT' | 'REDIRECTED' | 'SKIPPED' | 'FAILED'

/** What a route that sends a message returns alongside its own data. */
export interface EmailReport {
  emailed: EmailOutcome
  deliveredTo?: string | null
  /** SKIPPED only: 'SANDBOX' (sandbox on, no redirect inbox) or 'NO_RECIPIENT' (no address on file). */
  emailSkipReason?: 'SANDBOX' | 'NO_RECIPIENT'
}

/**
 * The toast for an outcome. `subject` names what was sent ("Work order", "Hub link",
 * "Invite"). Every non-SENT outcome tells the admin to copy the link — it is the only
 * way the message reaches anyone.
 */
export function emailOutcomeToast(r: EmailReport, subject: string): { message: string; severity: 'success' | 'warning' | 'error' } {
  switch (r.emailed) {
    case 'SENT':
      return { message: `${subject} emailed to ${r.deliveredTo ?? 'the recipient'}.`, severity: 'success' }
    case 'REDIRECTED':
      return { message: `Sandbox is on — redirected to ${r.deliveredTo ?? 'the sandbox inbox'}; copy the link.`, severity: 'warning' }
    case 'SKIPPED':
      return r.emailSkipReason === 'SANDBOX'
        ? { message: 'Sandbox is on — not sent; copy the link.', severity: 'warning' }
        : { message: 'No email on file — copy the link.', severity: 'warning' }
    default:
      return { message: `${subject} could not be emailed — copy the link.`, severity: 'error' }
  }
}

/** Fields for a route's JSON response, from the server's ReportedEmail. */
export function emailReport(r: { outcome: EmailOutcome; deliveredTo: string | null; skipReason?: 'SANDBOX' | 'NO_RECIPIENT' }): EmailReport {
  return { emailed: r.outcome, deliveredTo: r.deliveredTo, ...(r.skipReason && { emailSkipReason: r.skipReason }) }
}
