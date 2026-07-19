import type { AwaitingPickupRequest } from '@/components/shared/AwaitingPickupCard'

// CC-14: client-side shapes for the /api/operator/today payload (JSON — dates are
// strings). Kept separate from the server lib types (which import prisma) so the
// Today components stay client-only. Mirrors getOperatorToday's return.

export interface TodayVehicle {
  id: string // RigVehicle id
  vehicleId: string
  vehicle: {
    id: string
    name: string
    type: string
    isRental: boolean
    rentalAgreementUrl: string | null
    location: string | null
    notes: string | null
    odometer: number | null
  }
}

export interface TodayDeployment {
  id: string
  label: string | null
  startedAt: string
  notes: string | null
  operator: { id: string; name: string } | null
  secondaryOperators: { operator: { id: string; name: string } }[]
  project: { id: string; name: string } | null
  vehicles: TodayVehicle[]
  site: string | null
}

export interface TodayTransfer {
  id: string
  note: string
  fromRig: { id: string; operator: { id: string; name: string } | null }
  vehicles: { vehicle: { id: string; name: string; type: string } }[]
  items: { kitItem: { item: { id: string; name: string } } }[]
}

export interface TodayHandoff {
  id: string
  note: string
  fromOperatorName: string | null
}

export interface TodayRequest {
  id: string
  status: string
  requestType: string
  label: string | null
}

export interface TodayData {
  deployment: TodayDeployment | null
  checkedVehicleIds: string[]
  transfers: TodayTransfer[]
  handoffs: TodayHandoff[]
  requests: TodayRequest[]
  awaitingPickup: AwaitingPickupRequest[]
  asOf: string
}
