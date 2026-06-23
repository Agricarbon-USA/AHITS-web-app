import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/resend'
import { genericAlertEmail } from '@/lib/email/templates'

const ALERT_TITLES: Record<string, string> = {
  DAMAGE_REPORTED: 'Damage reported',
  EQUIPMENT_NOT_RETURNED: 'Equipment not returned',
  MAINTENANCE_OVERDUE: 'Maintenance overdue',
  REPAIR_NEEDED: 'Repair needed',
  LOW_INVENTORY: 'Low inventory',
  INSURANCE_EXPIRING: 'Insurance expiring',
  REGISTRATION_EXPIRING: 'Registration expiring',
  PIN_LOCKED: 'Operator PIN locked',
}

type Meta = Record<string, unknown>
const str = (v: unknown): string | null => (v == null ? null : String(v))

/** In-app deep link to an alert's underlying record, mirroring the dashboard. */
function linkFor(sourceTable: string | null, sourceId: string | null, type: string): string | null {
  if (sourceTable === 'maintenance_tasks' && sourceId) return `/admin/maintenance?task=${sourceId}`
  if (type === 'LOW_INVENTORY') return '/admin/inventory'
  if (type === 'EQUIPMENT_NOT_RETURNED') return '/admin/deployments'
  if (type === 'INSURANCE_EXPIRING' || type === 'REGISTRATION_EXPIRING') return '/admin/vehicles'
  if (type === 'PIN_LOCKED') return '/admin/users'
  return null
}

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
  const title = ALERT_TITLES[alert.type] ?? alert.type
  const subject = str(meta.itemName) ?? str(meta.taskName) ?? str(meta.name)
  let message: string
  switch (alert.type) {
    case 'DAMAGE_REPORTED': message = `${subject ?? 'An item'} was reported damaged in the field.`; break
    case 'MAINTENANCE_OVERDUE': message = `${str(meta.taskName) ?? 'A maintenance task'} is overdue${meta.daysPastDue ? ` by ${meta.daysPastDue} day(s)` : ''}.`; break
    case 'REPAIR_NEEDED': message = `${subject ?? 'An item'} needs repair.`; break
    case 'EQUIPMENT_NOT_RETURNED': message = `${subject ?? 'Equipment'} has not been returned on time.`; break
    case 'LOW_INVENTORY': message = `${subject ?? 'An item'} is running low on stock.`; break
    case 'INSURANCE_EXPIRING': message = `${subject ?? 'A vehicle'}'s insurance is expiring soon.`; break
    case 'REGISTRATION_EXPIRING': message = `${subject ?? 'A vehicle'}'s registration is expiring soon.`; break
    case 'PIN_LOCKED': message = `${str(meta.name) ?? 'An operator'}'s PIN was locked after too many failed attempts.`; break
    default: message = title
  }
  return { title, message, link: linkFor(alert.sourceTable, alert.sourceId, alert.type) }
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

/**
 * Dispatch every unresolved alert that hasn't been notified yet: create an
 * in-app Notification for each active admin and send one summary email to the
 * admin team, then stamp `notifiedAt` so the same alert is never sent twice.
 * Email failures are swallowed — the in-app rows still land and notifiedAt is
 * still set, so a misconfigured mailer doesn't cause per-minute retry spam.
 */
export async function dispatchPendingAlerts(): Promise<{ alerts: number; notifications: number; emailed: boolean }> {
  const pending = await prisma.alert.findMany({
    where: { resolved: false, notifiedAt: null },
    orderBy: { triggeredAt: 'asc' },
    take: 100,
  })
  if (pending.length === 0) return { alerts: 0, notifications: 0, emailed: false }

  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true, email: true },
  })
  if (admins.length === 0) return { alerts: 0, notifications: 0, emailed: false }

  let notifications = 0
  let emailed = false

  for (const alert of pending) {
    const p = presentAlert(alert)

    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: alert.type,
        title: p.title,
        body: p.message,
        link: p.link,
        alertId: alert.id,
      })),
    })
    notifications += admins.length

    try {
      const linkUrl = p.link ? `${APP_URL}${p.link}` : undefined
      await sendEmail({
        to: admins.map((a) => a.email),
        subject: `AHITS: ${p.title}`,
        html: genericAlertEmail(p.title, p.message, linkUrl),
      })
      emailed = true
    } catch {
      /* email misconfigured / transient — in-app notification still delivered */
    }

    await prisma.alert.update({ where: { id: alert.id }, data: { notifiedAt: new Date() } })
  }

  return { alerts: pending.length, notifications, emailed }
}
