import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TodayPrimaryAction } from '@/components/operator/today/TodayPrimaryAction'
import { VehicleChecks } from '@/components/operator/today/VehicleChecks'
import { WaitingOnMe } from '@/components/operator/today/WaitingOnMe'
import { DeploymentSummary } from '@/components/operator/today/DeploymentSummary'
import { MyRequestsSummary } from '@/components/operator/today/MyRequestsSummary'
import type { TodayVehicle, TodayDeployment, TodayTransfer, TodayHandoff, TodayRequest } from '@/components/operator/today/types'

// CC-14 (NS-10): component tests for the Today view sections (acceptance: split/new
// components ship with component tests, not lib/API only).

const vehicle = (id: string, name: string, extra?: Partial<TodayVehicle['vehicle']>): TodayVehicle => ({
  id: `rv-${id}`,
  vehicleId: id,
  vehicle: { id, name, type: 'TRUCK', isRental: false, rentalAgreementUrl: null, location: null, notes: null, odometer: null, ...extra },
})

describe('TodayPrimaryAction (CC-14)', () => {
  it('shows "Start daily check" and fires onStartCheck when checks are due', () => {
    const onStartCheck = vi.fn()
    render(<TodayPrimaryAction dueCount={2} hasVehicles onStartCheck={onStartCheck} />)
    const btn = screen.getByRole('button', { name: /Start daily check/i })
    fireEvent.click(btn)
    expect(onStartCheck).toHaveBeenCalledTimes(1)
    expect(btn).toHaveTextContent('(2)')
  })

  it('shows "You\'re set." when all vehicles are checked', () => {
    render(<TodayPrimaryAction dueCount={0} hasVehicles onStartCheck={vi.fn()} />)
    expect(screen.getByText(/You're set\./)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders nothing when there are no vehicles to check', () => {
    const { container } = render(<TodayPrimaryAction dueCount={0} hasVehicles={false} onStartCheck={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('VehicleChecks (CC-14)', () => {
  const vehicles = [vehicle('v1', 'Truck-01', { location: 'Gate B, code 4417' }), vehicle('v2', 'Truck-02')]

  it('marks done vehicles and offers a Check button for due ones', () => {
    const onCheck = vi.fn()
    render(<VehicleChecks vehicles={vehicles} checkedVehicleIds={['v1']} onCheck={onCheck} />)
    expect(screen.getByText('Truck-01')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()          // v1 checked
    expect(screen.getByText('Gate B, code 4417')).toBeInTheDocument() // read-only access note
    const checkButtons = screen.getAllByRole('button', { name: 'Check' })
    expect(checkButtons).toHaveLength(1)                           // only v2 is due
    fireEvent.click(checkButtons[0])
    expect(onCheck).toHaveBeenCalledWith('v2')                     // deep-links the right vehicle
  })

  it('renders nothing with no vehicles', () => {
    const { container } = render(<VehicleChecks vehicles={[]} checkedVehicleIds={[]} onCheck={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  // UXP-3 (F-08): "Done" becomes a tappable 44px button ONLY when there is somewhere
  // to go (onViewCheck) — the inert chip stays the default so nothing else changes.
  it('keeps the inert Done chip when onViewCheck is not passed', () => {
    render(<VehicleChecks vehicles={vehicles} checkedVehicleIds={['v1']} onCheck={vi.fn()} />)
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /View today's check/ })).toBeNull()
  })

  it('renders Done as a 44px button with an aria-label when onViewCheck is passed, and fires with the id', () => {
    const onViewCheck = vi.fn()
    render(<VehicleChecks vehicles={vehicles} checkedVehicleIds={['v1']} onCheck={vi.fn()} onViewCheck={onViewCheck} />)
    const done = screen.getByRole('button', { name: "View today's check for Truck-01" })
    expect(done).toHaveTextContent('Done')
    expect(done).toHaveStyle({ minHeight: '44px' })
    fireEvent.click(done)
    expect(onViewCheck).toHaveBeenCalledWith('v1')
    // The due vehicle still gets its Check button; the two never collide.
    expect(screen.getAllByRole('button', { name: 'Check' })).toHaveLength(1)
  })
})

describe('WaitingOnMe (CC-14)', () => {
  const transfers: TodayTransfer[] = [
    { id: 't1', note: '', fromRig: { id: 'r1', operator: { id: 'o1', name: 'Dana' } }, vehicles: [{ vehicle: { id: 'v', name: 'X', type: 'TRUCK' } }], items: [] },
  ]
  const handoffs: TodayHandoff[] = [{ id: 'h1', note: '', fromOperatorName: 'Sam' }]

  it('summarizes incoming transfers + handoffs and fires onReview', () => {
    const onReview = vi.fn()
    render(<WaitingOnMe transfers={transfers} handoffs={handoffs} onReview={onReview} />)
    expect(screen.getByText(/Waiting on you \(2\)/)).toBeInTheDocument()
    expect(screen.getByText('Dana')).toBeInTheDocument()
    expect(screen.getByText('Sam')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(onReview).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when nothing is waiting', () => {
    const { container } = render(<WaitingOnMe transfers={[]} handoffs={[]} onReview={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('DeploymentSummary (CC-14)', () => {
  const deployment: TodayDeployment = {
    id: 'rig1', label: 'Rig A', startedAt: '2026-07-19T12:00:00Z', notes: null,
    operator: { id: 'o1', name: 'Dana' }, secondaryOperators: [],
    project: { id: 'p1', name: 'Cropland KS' }, site: 'North field',
    vehicles: [vehicle('v1', 'Truck-01')],
  }

  it('shows the project, site, and vehicle count and opens the deployment', () => {
    const onOpen = vi.fn()
    render(<DeploymentSummary deployment={deployment} onOpenDeployment={onOpen} />)
    expect(screen.getByText('Cropland KS')).toBeInTheDocument()
    expect(screen.getByText('North field')).toBeInTheDocument()
    expect(screen.getByText('1 vehicle')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /My Deployment/i }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})

describe('MyRequestsSummary (CC-14)', () => {
  const requests: TodayRequest[] = [
    { id: 'q1', status: 'REQUESTED', requestType: 'MATERIAL', label: 'Need gloves' },
  ]

  it('shows the open count and top requests and opens the list', () => {
    const onOpen = vi.fn()
    render(<MyRequestsSummary requests={requests} onOpenRequests={onOpen} />)
    expect(screen.getByText('1 open request')).toBeInTheDocument()
    expect(screen.getByText('Need gloves')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /View all/i }))
    expect(onOpen).toHaveBeenCalled()
  })

  it('renders nothing when there are no open requests', () => {
    const { container } = render(<MyRequestsSummary requests={[]} onOpenRequests={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
