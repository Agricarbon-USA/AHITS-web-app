// Canonical vehicle-type enum values, labels, and display order.
// Single source of truth — import here instead of maintaining local copies.

export const VEHICLE_TYPES = [
  'TRUCK', 'TRAILER', 'POLARIS_UTV', 'CAN_AM_UTV', 'CHRISTIE_DRILL', 'ATV', 'BOBCAT', 'OTHER',
] as const
export type VehicleTypeValue = (typeof VEHICLE_TYPES)[number]

export const VEHICLE_TYPE_LABELS: Record<VehicleTypeValue, string> = {
  TRUCK: 'Truck',
  TRAILER: 'Trailer',
  POLARIS_UTV: 'Polaris UTV',
  CAN_AM_UTV: 'Can-Am UTV',
  CHRISTIE_DRILL: 'Christie Drill',
  ATV: 'ATV',
  BOBCAT: 'Bobcat',
  OTHER: 'Other',
}

export const VEHICLE_TYPE_ORDER: readonly VehicleTypeValue[] = [
  'TRUCK', 'TRAILER', 'POLARIS_UTV', 'CAN_AM_UTV', 'CHRISTIE_DRILL', 'ATV', 'BOBCAT', 'OTHER',
]

/** Returns the display label for a vehicle type. Returns '—' for null/undefined/unknown. */
export function vehicleTypeLabel(type: string | null | undefined): string {
  if (!type) return '—'
  return VEHICLE_TYPE_LABELS[type as VehicleTypeValue] ?? type
}
