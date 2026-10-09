import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/resend'
import { genericAlertEmail } from '@/lib/email/templates'
import { ALERT_LABELS, alertLink } from '@/lib/alert-display'
import { getNotificationConfig } from '@/lib/notification-config'
import { ACTIVE_USER } from '@/lib/populations'

type Meta = Record<string, unknown>
const str = (v: unknown): string | null => (v == null ? null : String(v))

export interface AlertPresentation {
  title: string
  message: string
  link: string | null
}

/** Human-readable title/message/link for an alert, shared by email + in-app. */
export function presentAlert(alert: {
  type: string
  sourceTable: string | null
  sourceId: string | null
  metadata: unknown
}): AlertPresentation {
  const meta = (alert.metadata ?? {}) as Meta
  const title = ALERT_LABELS[alert.type] ?? alert.type
  // PR-4: a vehicle damage report carries `vehicleName` — it used to read "An item was reported damaged".
  const subject = str(meta.itemName) ?? str(meta.vehicleName) ?? str(meta.taskName) ?? str(meta.name)
  let message: string
  switch (alert.type) {
    // CC-34 (3e): the shop-completed work order reuses this type with a phase marker —
    // check it FIRST so a READY_TO_FINALIZE alert reads as "review and finalize", not "damaged".
    case 'DAMAGE_REPORTED':
      message = meta.phase === 'READY_TO_FINALIZE'
        ? `Repair completed by ${str(meta.shop) ?? 'the shop'} — review and finalize in Maintenance.`
        : `${subject ?? 'An item'} was reported damaged in the field.`
      break
    // CC-34 (3b): the stale-damage marker (staleDamageDays) reuses this type — check it
    // FIRST so a forgotten damage repair reads as a gentle nudge, not a calendar "overdue".
    case 'MAINTENANCE_OVERDUE':
      message = meta.staleDamageDays != null
        ? `${str(meta.taskName) ?? 'A maintenance task'} — no updates in ${meta.staleDamageDays} days. Worth a look.`
        : `${str(meta.taskName) ?? 'A maintenance task'} is overdue${meta.daysPastDue ? ` by ${meta.daysPastDue} day(s)` : ''}.`
      break
    case 'EQUIPMENT_NOT_RETURNED': message = `${subject ?? 'Equipment'} has not been returned on time.`; break
    case 'LOW_INVENTORY': {
      const hubPart = str(meta.hubName) ? ` at ${str(meta.hubName)}` : ''
      message = `${subject ?? 'An item'} is running low${hubPart}${meta.quantity != null && meta.threshold != null ? ` (${meta.quantity} left, threshold ${meta.threshold})` : ''}.`
      break
    }
    case 'INSURANCE_EXPIRING': message = `${subject ?? 'A vehicle'}'s insurance is expiring soon.`; break
    case 'REGISTRATION_EXPIRING': message = `${subject ?? 'A vehicle'}'s registration is expiring soon.`; break
    case 'PIN_LOCKED': message = `${str(meta.name) ?? 'An operator'}'s PIN was locked after too many failed attempts.`; break
    case 'MATERIAL_REQUEST': message = `${str(meta.name) ?? 'A material request'} needs your attention.`; break
    case 'DAILY_CHECK_FAILED': message = `${subject ?? 'A vehicle'} failed its daily check${str(meta.operatorName) ? ` (reported by ${str(meta.operatorName)})` : ''}${str(meta.issues) ? `: ${str(meta.issues)}` : '.'}`; break
    case 'EMAIL_FAILED': {
      const to = str(meta.to) ?? 'a recipient'
      const emailSubject = str(meta.subject)
      const kind = str(meta.kind)
      const attempts = typeof meta.attempts === 'number' ? meta.attempts : null
      message = `Failed to email ${to}${emailSubject ? ` — "${emailSubject}"` : ''}${kind ? ` (${kind}${attempts && attempts > 1 ? `, ${attempts} attempts` : ''})` : ''}.`
      break
    }
    default: message = title
  }
  // CC-26: pass metadata so a DAILY_CHECK_FAILED link carries its checkId (bell + email).
  return { title, message, link: alertLink(alert.sourceTable, alert.sourceId, alert.type, meta as Record<string, string | number | boolean | null>) }
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

/**
 * Dispatch every unresolved alert that hasn't been notified yet: create an
 * in-app Notification for each active admin and send one summary email to the
 * admin team, then stamp `notifiedAt` so the same alert is never sent twice.
 *
 * PR-4:
 *   • P-2 — alert types the admin disabled are excluded IN THE QUERY. They used to
 *     be filtered after a `take: 100`, so 100 unresolved alerts of a disabled type
 *     filled every page and no other alert was ever notified again. (Disabled types
 *     stay un-notified — still recorded and on the dashboard — and notify on the
 *     next run if re-enabled, since notifiedAt is still null.)
 *   • P-14 — the bell rows are created and the alert CLAIMED (notifiedAt null→now)
 *     in one transaction, so a crash between the two can't leave an alert marked
 *     notified with no bell rows (or bell rows with the alert re-sent). Only the run
 *     whose claim wins sends the email, outside the transaction. Email failures are
 *     swallowed — the bell rows have landed — so a misconfigured mailer doesn't
 *     cause per-minute retry spam.
 */
export async function dispatchPendingAlerts(): Promise<{ alerts: number; notifications: number; emailed: boolean }> {
  const { disabledAlertTypes } = await getNotificationConfig()
  const pending = await prisma.alert.findMany({
    where: {
      resolved: false,
      notifiedAt: null,
      ...(disabledAlertTypes.length > 0 && { type: { notIn: disabledAlertTypes as never[] } }),
    },
    orderBy: [{ triggeredAt: 'asc' }, { id: 'asc' }],
    take: 100,
  })
  if (pending.length === 0) return { alerts: 0, notifications: 0, emailed: false }

  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', ...ACTIVE_USER },
    select: { id: true, email: true },
  })
  if (admins.length === 0) return { alerts: 0, notifications: 0, emailed: false }

  let notifications = 0
  let emailed = false

  for (const alert of pending) {
    const p = presentAlert(alert)
    // Create the bell rows, then claim — one transaction. A concurrent run that
    // claimed first makes this claim match 0 rows, and the transaction rolls back
    // (its bell rows are idempotent anyway via @@unique([alertId, userId])).
    const claimed = await prisma.$transaction(async (tx) => {
      await tx.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: alert.type,
          title: p.title,
          body: p.message,
          link: p.link,
          alertId: alert.id,
        })),
        skipDuplicates: true,
      })
      const claim = await tx.alert.updateMany({
        where: { id: alert.id, notifiedAt: null, resolved: false },
        data: { notifiedAt: new Date() },
      })
      if (claim.count === 0) throw new AlreadyClaimed()
      return true
    }).catch((err) => {
      if (err instanceof AlreadyClaimed) return false
      throw err
    })
    if (!claimed) continue
    notifications += admins.length

    try {
      const linkUrl = p.link ? `${APP_URL}${p.link}` : undefined
      await sendEmail({ kind: 'ALERT',
        to: admins.map((a) => a.email),
        subject: `AHITS: ${p.title}`,
        html: genericAlertEmail(p.title, p.message, linkUrl),
      })
      emailed = true
    } catch {
      /* email misconfigured / transient — in-app notification still delivered */
    }
  }

  return { alerts: pending.length, notifications, emailed }
}

/** Rolls back the create-then-claim transaction when another run claimed the alert first. */
class AlreadyClaimed extends Error {}
