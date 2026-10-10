import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SWRConfig } from 'swr'
import OperatorTodayPage from '@/app/(operator)/operator/dashboard/page'
import { VehicleChecks, CREW_CHECK_NOTE } from '@/components/operator/today/VehicleChecks'
import type { TodayData, TodayVehicle } from '@/components/operator/today/types'

// PR-5c (L-8, owner decision final): every operator on a rig sees it on Today, and the
// rig's checks are shared. A SECONDARY's Today shows the crew rig and its due checks;
// a check a crewmate filed shows done with who and when; it isn't opened (the server
// reads and redoes own checks only), so there is a one-line reason, not a failing button.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { userId: 'crew1', name: 'Ben Crew', role: 'OPERATOR' } }) }))

const truck = (id: string, name: string): TodayVehicle => ({
  id: `rv-${id}`,
  vehicleId: id,
  vehicle: { id, name, type: 'TRUCK', isRental: false, rentalAgreementUrl: null, location: null, notes: null, odometer: null },
})

const AT = '2026-10-09T12:42:00.000Z'
const CHECKED_AT = new Date(AT).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

const TODAY: TodayData = {
  deployment: {
    id: 'rig1', label: 'North block', startedAt: '2026-10-08T12:00:00Z', notes: null,
    operator: { id: 'prim1', name: 'Ana Primary' },
    secondaryOperators: [{ operator: { id: 'crew1', name: 'Ben Crew' } }],
    project: null, site: null, isPrimary: false,
    vehicles: [truck('v1', 'Truck-01'), truck('v2', 'Truck-02')],
  },
  checkedVehicleIds: ['v1'],
  vehicleChecks: [{ vehicleId: 'v1', checkId: 'c1', operatorId: 'prim1', operatorName: 'Ana Primary', submittedAt: AT, byMe: false }],
  transfers: [], handoffs: [], requests: [], awaitingPickup: [], asOf: AT,
}

describe('PR-5c · Today for a crew member (SECONDARY)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ data: TODAY }) } as Response)))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('renders the crew rig, its due checks, and a crewmate’s check as done with who and when', async () => {
    render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><OperatorTodayPage /></SWRConfig>)
    expect(await screen.findByText('North block')).toBeInTheDocument()
    expect(screen.getByText("On Ana Primary's crew")).toBeInTheDocument()
    // The due check: Truck-02 still offers Check, so the day's motion is still "Start".
    expect(screen.getByRole('button', { name: /Start daily check/i })).toBeInTheDocument()
    const row2 = screen.getByText('Truck-02').closest('div')!.parentElement!
    expect(within(row2).getByRole('button', { name: 'Check' })).toBeInTheDocument()
    // The shared done state: Truck-01 is done by Ana, at her time, and not openable.
    expect(screen.getByText(new RegExp(`Checked by Ana Primary at ${CHECKED_AT}`))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(CREW_CHECK_NOTE.replace('.', '\\.')))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /View today's check for Truck-01/ })).toBeNull()
    expect(screen.queryByText(/No deployment assigned to you yet/)).toBeNull()
  })
})

describe('PR-5c · VehicleChecks shared done state', () => {
  const vehicles = [truck('v1', 'Truck-01')]

  it('my own check stays openable and says "you"', () => {
    const onViewCheck = vi.fn()
    render(
      <VehicleChecks
        vehicles={vehicles}
        checkedVehicleIds={['v1']}
        checks={[{ vehicleId: 'v1', checkId: 'c1', operatorId: 'crew1', operatorName: 'Ben Crew', submittedAt: AT, byMe: true }]}
        onCheck={vi.fn()}
        onViewCheck={onViewCheck}
      />,
    )
    expect(screen.getByText(`Checked by you at ${CHECKED_AT}`)).toBeInTheDocument()
    screen.getByRole('button', { name: /View today's check for Truck-01/ }).click()
    expect(onViewCheck).toHaveBeenCalledWith('v1')
    expect(screen.queryByText(new RegExp(CREW_CHECK_NOTE.replace('.', '\\.')))).toBeNull()
  })

  it("a crewmate's check shows Done (no button) with the one-line reason", () => {
    render(
      <VehicleChecks
        vehicles={vehicles}
        checkedVehicleIds={['v1']}
        checks={[{ vehicleId: 'v1', checkId: 'c1', operatorId: 'prim1', operatorName: 'Ana Primary', submittedAt: AT, byMe: false }]}
        onCheck={vi.fn()}
        onViewCheck={vi.fn()}
      />,
    )
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
