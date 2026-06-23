// Single source of truth for status → display label + MUI chip color.
// Replaces the per-page maps that had drifted across the scan and inventory
// screens. Server code can import the data; UI should prefer <StatusChip/>.

export type StatusColor = 'success' | 'info' | 'warning' | 'error' | 'default'

export interface StatusMeta {
  label: string
  color: StatusColor
}

// Equipment / inventory-unit status (EquipmentStatus enum).
export const EQUIPMENT_STATUS: Record<string, StatusMeta> = {
  AVAILABLE: { label: 'Available', color: 'success' },
  CHECKED_OUT: { label: 'Checked Out', color: 'info' },
  IN_MAINTENANCE: { label: 'In Maintenance', color: 'warning' },
  INOPERABLE: { label: 'Inoperable', color: 'error' },
  RETIRED: { label: 'Retired', color: 'default' },
}

// Vehicle status (VehicleStatus enum).
export const VEHICLE_STATUS: Record<string, StatusMeta> = {
  ACTIVE: { label: 'Active', color: 'success' },
  IN_MAINTENANCE: { label: 'In Maintenance', color: 'warning' },
  OUT_OF_SERVICE: { label: 'Out of Service', color: 'error' },
  RETIRED: { label: 'Retired', color: 'default' },
}

// Maintenance-task status (MaintenanceStatus enum).
export const MAINTENANCE_STATUS: Record<string, StatusMeta> = {
  UPCOMING: { label: 'Upcoming', color: 'default' },
  DUE_SOON: { label: 'Due Soon', color: 'info' },
  OVERDUE: { label: 'Overdue', color: 'error' },
  IN_PROGRESS: { label: 'In Progress', color: 'warning' },
  COMPLETED: { label: 'Completed', color: 'success' },
}

// Task priority (Priority enum).
export const PRIORITY_STATUS: Record<string, StatusMeta> = {
  HIGH: { label: 'High', color: 'error' },
  MEDIUM: { label: 'Medium', color: 'warning' },
  LOW: { label: 'Low', color: 'default' },
}

// Operator-declared equipment condition on return/scan. One vocabulary so the
// scan flow and the disposition dialog present identical wording (M1-8). The
// `<ConditionSelect/>` control renders these options; submit payloads stay
// per-endpoint.
export type ReturnCondition = 'GOOD' | 'IN_MAINTENANCE' | 'INOPERABLE'

export const RETURN_CONDITION: Record<ReturnCondition, StatusMeta> = {
  GOOD: { label: 'Good', color: 'success' },
  IN_MAINTENANCE: { label: 'Needs maintenance', color: 'warning' },
  INOPERABLE: { label: 'Inoperable', color: 'error' },
}

// Ordered options for a condition <Select>.
export const RETURN_CONDITION_OPTIONS = (Object.keys(RETURN_CONDITION) as ReturnCondition[])
  .map((value) => ({ value, label: RETURN_CONDITION[value].label }))

// The damaged-item "can it be fixed?" question, shared by every screen that
// marks an item inoperable so the wording never drifts.
export const FIXABLE_OPTIONS = [
  { value: 'yes', label: 'Yes — send for repair' },
  { value: 'no', label: 'No — write off' },
] as const

export function equipmentStatusMeta(status: string): StatusMeta {
  return EQUIPMENT_STATUS[status] ?? { label: status, color: 'default' }
}

export function vehicleStatusMeta(status: string): StatusMeta {
  return VEHICLE_STATUS[status] ?? { label: status, color: 'default' }
}

export function maintenanceStatusMeta(status: string): StatusMeta {
  return MAINTENANCE_STATUS[status] ?? { label: status, color: 'default' }
}

export function priorityMeta(priority: string): StatusMeta {
  return PRIORITY_STATUS[priority] ?? { label: priority, color: 'default' }
}
