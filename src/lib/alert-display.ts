// Pure, client-safe alert display vocabulary — the single source of truth for
// how an alert is labelled and where it deep-links. Shared by the dashboard
// Active Alerts list, the notification dispatcher (email + in-app), and the
// notification bell, so wording and links never drift between surfaces.
// IMPORTANT: keep this free of server-only imports (prisma/email) so client
// components can import it.

export const ALERT_LABELS: Record<string, string> = {
  DAMAGE_REPORTED: 'Damage reported',
  EQUIPMENT_NOT_RETURNED: 'Equipment not returned',
  MAINTENANCE_OVERDUE: 'Maintenance overdue',
  LOW_INVENTORY: 'Low inventory',
  WORK_ORDER_UPDATE: 'Work order update',
  INSURANCE_EXPIRING: 'Insurance expiring',
  REGISTRATION_EXPIRING: 'Registration expiring',
  PIN_LOCKED: 'Operator PIN locked',
  MATERIAL_REQUEST: 'Material request',
  DAILY_CHECK_FAILED: 'Daily check failed',
  DAILY_CHECK_MISSED: 'Daily check missed',
  EMAIL_FAILED: 'Email delivery failed',
  CRON_SILENT: 'Cron heartbeat silent',
}

export function alertLabel(type: string): string {
  return ALERT_LABELS[type] ?? type
}

type AlertMetaLike = Record<string, string | number | boolean | null> | null | undefined

/** In-app deep link to an alert's underlying record, or null if none. */
export function alertLink(
  sourceTable: string | null,
  sourceId: string | null,
  type: string,
  // CC-26: optional metadata, read ONLY by the DAILY_CHECK_FAILED branch (to carry the
  // failed check's id). Every other branch is unchanged — the rest of CC-20 #6's
  // deep-links-everywhere stays PARKED (scope guard).
  metadata?: AlertMetaLike,
): string | null {
  if (sourceTable === 'maintenance_tasks' && sourceId) return `/admin/maintenance?task=${sourceId}`
  if (type === 'LOW_INVENTORY') return '/admin/inventory'
  if (type === 'EQUIPMENT_NOT_RETURNED') return '/admin/deployments'
  if (type === 'INSURANCE_EXPIRING' || type === 'REGISTRATION_EXPIRING') return '/admin/vehicles'
  if (type === 'DAILY_CHECK_FAILED') {
    // CC-26: deep-link to the exact failed check when the alert carries its id. Older
    // alerts (raised before CC-26) have no checkId until they re-raise, so fall back to
    // the vehicles surface rather than a broken link.
    const checkId = metadata && typeof metadata.checkId === 'string' ? metadata.checkId : null
    return checkId ? `/admin/vehicles?check=${checkId}` : '/admin/vehicles'
  }
  if (type === 'DAILY_CHECK_MISSED') {
    // CC-26: a missed check has no record to open; the alert's sourceId IS the
    // operatorId, so land on that operator's deployment (its drawer reaches the
    // per-vehicle check history). Falls back to the deployments list if none matches.
    return sourceId ? `/admin/deployments?operator=${sourceId}` : '/admin/deployments'
  }
  if (type === 'PIN_LOCKED') return '/admin/users'
  if (type === 'MATERIAL_REQUEST') return '/admin/requests'
  if (type === 'EMAIL_FAILED') return '/admin/settings#email-delivery'
  return null
}

/**
 * PR-4 (D-i · P-9): alert types an evaluator owns — raised AND cleared by the cron
 * when the condition starts and ends (src/lib/alert-evaluators.ts, plus the fixed-key
 * INVENTORY_DRIFT monitors and CRON_SILENT). A manual Resolve on one of these came
 * back within the hour, because the condition still held; the admin UI hides Resolve
 * for them and says why. EMAIL_FAILED is NOT here: some failed kinds have no resend
 * path, so an admin must be able to dismiss it (it does not come back, see the cron).
 */
export const SELF_CLEARING_ALERT_TYPES: ReadonlySet<string> = new Set([
  'MAINTENANCE_OVERDUE',
  'LOW_INVENTORY',
  'INSURANCE_EXPIRING',
  'REGISTRATION_EXPIRING',
  'DAILY_CHECK_MISSED',
  'EQUIPMENT_NOT_RETURNED',
  'PIN_LOCKED',
  'INVENTORY_DRIFT',
  'CRON_SILENT',
])

export function clearsItself(type: string): boolean {
  return SELF_CLEARING_ALERT_TYPES.has(type)
}
