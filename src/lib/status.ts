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
