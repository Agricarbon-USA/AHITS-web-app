import type {
  User, InventoryItem, Vehicle, DailyCheck, CheckLog,
  MaintenanceTask, Project, Alert, Photo,
  UserRole, VehicleType, VehicleStatus, EquipmentStatus,
  EquipmentCategory, CheckAction, Condition, Priority,
  MaintenanceStatus, ProjectStatus, ProjectType, AlertType,
  PhotoContext, IntervalType,
} from '@prisma/client'

// Re-export prisma types
export type {
  User, InventoryItem, Vehicle, DailyCheck, CheckLog,
  MaintenanceTask, Project, Alert, Photo,
  UserRole, VehicleType, VehicleStatus, EquipmentStatus,
  EquipmentCategory, CheckAction, Condition, Priority,
  MaintenanceStatus, ProjectStatus, ProjectType, AlertType,
  PhotoContext, IntervalType,
}

// API response wrapper
export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

// Paginated response
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

// Session user (from JWT)
export interface SessionUser {
  userId: string
  role: UserRole
  name: string
  email: string
  homeHubId?: string | null
}

// Daily check form
export interface ChecklistItem {
  key: string
  label: string
  value: 'yes' | 'no' | 'na'
  note?: string
}

// The standard ~16-item daily vehicle inspection from PRD §11.4. This is the
// single source of truth — the operator daily-check screen renders this list
// (do not redefine a shorter list elsewhere). Items 15–16 are conditional
// (towing / hauling) and are expected to be marked N/A when not applicable.
// Admin-configurable / per-vehicle-type custom checklists are M5 item 25.
export const DEFAULT_DAILY_CHECKLIST: Array<{ key: string; label: string }> = [
  { key: 'tire_pressure', label: 'Tire pressure (all 4 / UTV tracks)' },
  { key: 'tire_condition', label: 'Tire condition / wear' },
  { key: 'lights', label: 'Headlights, brake lights, reverse lights' },
  { key: 'windshield_wipers', label: 'Windshield / wipers' },
  { key: 'oil', label: 'Engine oil level' },
  { key: 'coolant', label: 'Coolant level' },
  { key: 'fuel', label: 'Fuel level' },
  { key: 'brake_fluid', label: 'Brake fluid level' },
  { key: 'seatbelts', label: 'Seatbelts (all positions)' },
  { key: 'horn', label: 'Horn' },
  { key: 'fluid_leaks', label: 'No visible fluid leaks' },
  { key: 'emergency_kit', label: 'Emergency roadside kit' },
  { key: 'first_aid', label: 'First aid kit stocked' },
  { key: 'fire_extinguisher', label: 'Fire extinguisher charged' },
  { key: 'trailer_hitch', label: 'Trailer hitch secure (if towing)' },
  { key: 'load_secured', label: 'Load secured (if hauling)' },
]

// Offline queue item (IndexedDB)
export interface OfflineQueueItem {
  id?: number
  endpoint: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body: unknown
  createdAt: number
  retries: number
  /**
   * Stable key generated when the action is taken (crypto.randomUUID()).
   * Sent as the `Idempotency-Key` header so a replay that the server already
   * processed is recognised and not applied twice. Required for any
   * non‑idempotent write (check‑out, transfer, end deployment, etc.).
   */
  idempotencyKey?: string
  /**
   * 'pending' = will be retried; 'failed' = terminal client error (4xx),
   * surfaced to the operator as "needs attention" rather than retried forever.
   */
  status?: 'pending' | 'failed'
  /** Last server/client error message, for the needs‑attention surface. */
  lastError?: string
  /** Human label for the action, shown in the pending/failed list. */
  label?: string
  /**
   * M1-9: client-generated placeholder id ("pending-…") for a create whose
   * server id isn't known yet. On successful replay the real id is read from
   * the response and every later queued item referencing this placeholder is
   * remapped to it (see lib/offline-remap.ts), so dependent offline writes
   * (e.g. create deployment → add items) survive sync.
   */
  placeholderId?: string
}

// Snapshot of the offline queue for honest UI indicators.
export interface OfflineQueueStatus {
  online: boolean
  syncing: boolean
  pending: number
  failed: number
}

// Result of a network-or-queue mutation.
export type MutateResult<T = unknown> =
  | { ok: true; queued: false; data: T }
  | { ok: true; queued: true; data: null }
  | { ok: false; queued: false; error: string; status: number; reason?: 'storage' }

// Dashboard stats
export interface DashboardStats {
  activeDeployments: number
  vehiclesActive: number
  vehiclesInMaintenance: number
  itemsCheckedOut: number
  overdueMaintenanceCount: number
  pendingAlertsCount: number
  todayChecksSubmitted: number
}
