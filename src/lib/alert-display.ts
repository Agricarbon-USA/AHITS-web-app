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
}

export function alertLabel(type: string): string {
  return ALERT_LABELS[type] ?? type
}

/** In-app deep link to an alert's underlying record, or null if none. */
export function alertLink(sourceTable: string | null, sourceId: string | null, type: string): string | null {
  if (sourceTable === 'maintenance_tasks' && sourceId) return `/admin/maintenance?task=${sourceId}`
  if (type === 'LOW_INVENTORY') return '/admin/inventory'
  if (type === 'EQUIPMENT_NOT_RETURNED') return '/admin/deployments'
  if (type === 'INSURANCE_EXPIRING' || type === 'REGISTRATION_EXPIRING') return '/admin/vehicles'
  if (type === 'DAILY_CHECK_FAILED') return '/admin/vehicles'
  if (type === 'DAILY_CHECK_MISSED') return '/admin/users'
  if (type === 'PIN_LOCKED') return '/admin/users'
  if (type === 'MATERIAL_REQUEST') return '/admin/requests'
  return null
}
