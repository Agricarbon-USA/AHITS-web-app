import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NewDeploymentDialog, type InventoryOption, type PickupPreset } from '@/components/operator/NewDeploymentDialog'

// REQ-B fix 3: "Pick Up Reservation" keeps the reserved amount. The operator's own
// hold at the reservation's hub counts as available to this pick-up, so the form
// opens on the held amount and the server receives it in full.

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }))

vi.mock('@/hooks/useOfflineQueue', () => ({
  useOfflineQueue: () => ({ mutate, pendingDeployCreate: false, refresh: vi.fn() }),
}))
vi.mock('@/components/shared/useToast', () => ({ useToast: () => vi.fn() }))

const HUBS = [{ id: 'h1', name: 'Hub', city: 'Toledo', state: 'OH' }]

const BAGS: InventoryOption = {
  id: 'i1',
  name: 'Bags',
  itemType: 'CONSUMABLE',
  quantity: 10,
  lowStockThreshold: null,
  category: null,
  unitCounts: { available: 0 },
  availableQuantity: 2,
  availableUnits: [],
  hubStock: [{ hubId: 'h1', hubName: 'Hub', quantity: 10, reservedQty: 8, available: 2 }],
}

const preset = (qtys: number[]): PickupPreset => ({
  requestId: 'req1',
  label: null,
  hubId: 'h1',
  lines: qtys.map((qty) => ({ itemId: 'i1', qty })),
})

beforeEach(() => {
  mutate.mockReset().mockResolvedValue({ ok: true, queued: false })
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ data: [] }) } as Response)))
})

afterEach(() => { vi.unstubAllGlobals() })

function openKitStep(p: PickupPreset) {
  render(
    <NewDeploymentDialog
      vehicles={[]}
      inventoryItems={[BAGS]}
      operators={[]}
      hubs={HUBS}
      pickupPreset={p}
      onClose={vi.fn()}
      onSuccess={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  return screen.getByRole('spinbutton') as HTMLInputElement
}

describe('REQ-B fix 3: Pick Up keeps the reserved amount', () => {
  it('opens on the held 8 (not the 2 un-reserved) and sends 8 with fromRequestId', async () => {
    const box = openKitStep(preset([8]))
    expect(box.value).toBe('8')
    expect(screen.getByText('2 available · 8 reserved')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pick Up' }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    const body = mutate.mock.calls[0][0].body
    expect(body.fromRequestId).toBe('req1')
    expect(body.kitItems).toEqual([{ inventoryItemId: 'i1', quantity: 8 }])
  })

  it('caps typing at held + free stock (12 → 10)', () => {
    const box = openKitStep(preset([8]))
    fireEvent.change(box, { target: { value: '12' } })
    expect(box.value).toBe('10')
  })

  it('adds up two held lines of the same item (5 + 3 → 8)', () => {
    const box = openKitStep(preset([5, 3]))
    expect(box.value).toBe('8')
  })
})
