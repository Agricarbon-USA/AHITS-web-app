import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// CC-12 PR3: the two heavy My-Deployment cards are extracted + React.memo'd. These
// tests cover (a) they render, and (b) the memo boundary — the headline acceptance
// "a state change doesn't re-render the whole page". We spy on a leaf each card
// renders (StatusChip): the spy fires once per card body execution, so if an
// UNRELATED container state change re-renders the container but the memoized card
// bails out, the spy count does NOT increase. That's the CI-verifiable proxy for
// the perf goal (actual DevTools profiling / felt scroll is the A6 device pass).
const chipSpy = vi.fn()
vi.mock('@/components/shared/StatusChip', () => ({
  StatusChip: ({ label }: { label: React.ReactNode }) => {
    chipSpy()
    return <span data-testid="status-chip">{typeof label === 'string' ? label : ''}</span>
  },
}))

import { DeploymentVehiclesCard, DeploymentKitCard, type VehicleRow, type KitRow } from '@/components/operator/DeploymentCards'

const VEHICLES: VehicleRow[] = [
  { id: 'rv1', vehicle: { id: 'v1', name: 'Truck-01', type: 'TRUCK', isRental: true, rentalAgreementUrl: null } },
]
const KIT: KitRow[] = [
  { id: 'ki1', quantity: 2, item: { id: 'i1', name: 'Drill', itemType: 'CONSUMABLE', lowStockThreshold: 5 }, inventoryUnit: null },
]
const noop = () => {}

describe('DeploymentVehiclesCard (CC-12 PR3)', () => {
  it('renders the vehicles and the rental/agreement badges', () => {
    render(
      <DeploymentVehiclesCard vehicles={VEHICLES} removingVehicles={false} selVehicles={new Set()}
        setSelVehicles={noop} setRemovingVehicles={noop} onAddVehicles={noop} onRemoveSelected={noop} />,
    )
    expect(screen.getByText('Truck-01')).toBeInTheDocument()
    expect(screen.getByText('Rental')).toBeInTheDocument()
    expect(screen.getByText('Agreement needed')).toBeInTheDocument()
  })

  it('does not re-render on an UNRELATED container state change (memo boundary)', () => {
    function Harness() {
      const [tick, setTick] = React.useState(0)
      const stable = React.useMemo(() => ({
        vehicles: VEHICLES, removingVehicles: false, selVehicles: new Set<string>(),
        setSelVehicles: noop, setRemovingVehicles: noop, onAddVehicles: noop, onRemoveSelected: noop,
      }), [])
      return (
        <>
          <button onClick={() => setTick((t) => t + 1)}>bump</button>
          <span data-testid="tick">{tick}</span>
          <DeploymentVehiclesCard {...stable} />
        </>
      )
    }
    render(<Harness />)
    const before = chipSpy.mock.calls.length
    fireEvent.click(screen.getByText('bump'))
    expect(screen.getByTestId('tick').textContent).toBe('1') // the container DID re-render…
    expect(chipSpy.mock.calls.length).toBe(before)            // …but the memoized card did not.
  })
})

describe('DeploymentKitCard (CC-12 PR3)', () => {
  it('renders kit items and the item-type badge', () => {
    render(
      <DeploymentKitCard kitItems={KIT} removingItems={false} selItems={new Set()}
        setSelItems={noop} setRemovingItems={noop} onAddItems={noop} onRemoveSelected={noop}
        onLogUsage={vi.fn()} onReturnItem={vi.fn()} />,
    )
    expect(screen.getByText('Drill')).toBeInTheDocument()
    expect(screen.getByText('Consumable')).toBeInTheDocument() // item type, one casing (CC-24)
  })

  it('does not re-render on an unrelated container state change (memo boundary)', () => {
    function Harness() {
      const [tick, setTick] = React.useState(0)
      const stable = React.useMemo(() => ({
        kitItems: KIT, removingItems: false, selItems: new Set<string>(),
        setSelItems: noop, setRemovingItems: noop, onAddItems: noop, onRemoveSelected: noop,
        onLogUsage: noop, onReturnItem: noop,
      }), [])
      return (
        <>
          <button onClick={() => setTick((t) => t + 1)}>bump</button>
          <DeploymentKitCard {...stable} />
        </>
      )
    }
    render(<Harness />)
    const before = chipSpy.mock.calls.length
    fireEvent.click(screen.getByText('bump'))
    expect(chipSpy.mock.calls.length).toBe(before)
  })
})
