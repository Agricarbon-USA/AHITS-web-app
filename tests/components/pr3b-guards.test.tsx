import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider } from '@/components/shared/useToast'

// PR-3b (D-a · D-g · S-2 · U-8): the admin UI for derived states.
//  - Vehicle drawer: In maintenance is shown read-only with its open repair linked;
//    "Return to service" when out of service, "Take out of service" when active (both
//    confirmed, both PATCH the admin-owned status); the Edit form offers only Active /
//    Out of service / Retired.
//  - Inventory: item Retire is live again (BF-1 flow) — confirm copy, PATCH, refetch,
//    the 409 text toasted, Show retired → "Retired" chip and no Retire; the unit
//    dropdown offers Available / Retired only, other states are chips with their source.
//  - DispositionDialog starts a unit that is not plainly checked out on "repair".
//  - Scan: an applied field fix refreshes the scanned panel without a re-scan.

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/hooks/useHistoryGuard', () => ({ useHistoryGuard: () => {} }))
vi.mock('@/lib/qr-label', () => ({ downloadQrLabel: vi.fn(async () => {}) }))
type MutateArg = { endpoint: string; method: string; body: unknown; label?: string }
const mutate = vi.fn(async (_opts: MutateArg) => ({ ok: true, queued: false, data: {} }))
vi.mock('@/hooks/useOfflineQueue', () => ({ useOfflineQueue: () => ({ mutate, isOffline: false }) }))
vi.mock('@/components/shared/PhotoCapture', () => ({ PhotoCapture: () => null }))
vi.mock('@/components/shared/QrScannerDialog', () => ({
  QrScannerDialog: ({ open, onResolve }: { open: boolean; onResolve: (c: string) => Promise<unknown> }) =>
    open ? <button onClick={() => { void onResolve('VEH-QR') }}>fake scan</button> : null,
}))

import AdminVehiclesPage from '@/app/(admin)/admin/vehicles/page'
import AdminInventoryPage from '@/app/(admin)/admin/inventory/page'
import OperatorScanPage from '@/app/(operator)/operator/scan/page'
import { DispositionDialog } from '@/components/shared/DispositionDialog'

const jsonRes = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body } as Response)

type Call = { url: string; method: string; body: Record<string, unknown> | null }
let calls: Call[] = []
const record = (input: RequestInfo | URL, init?: RequestInit) => {
  const c = { url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null }
  calls.push(c)
  return c
}
afterEach(() => { vi.unstubAllGlobals() })
beforeEach(() => { calls = []; replace.mockClear(); mutate.mockClear() })

// ── Vehicles ──────────────────────────────────────────────────────────────────
const baseVehicle = {
  type: 'TRUCK', year: 2022, odometer: 100, location: null, hubId: null, hubName: null, makeModel: null, vin: null,
  licensePlate: null, qrCodeId: 'qr-v1', assignedOperatorName: null, activeProjects: [], insuranceExpires: null,
  registrationExpires: null, notes: null, isRental: false, rentalCompany: null, rentalAgreementNumber: null,
  rentalAgreementUrl: null, rentalStartDate: null, rentalEndDate: null, rentalLocation: null, rentalReturnLocation: null,
  rentalCostAmount: null, rentalCostPeriod: null, rentalOneWay: false, _count: { dailyChecks: 0, maintenanceTasks: 0 },
}
function stubVehicles(status: string, tasks: unknown[] = []) {
  const v = { ...baseVehicle, id: 'v1', name: 'Truck 1', status }
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const c = record(input, init)
    if (c.method === 'PATCH') return jsonRes({ data: { id: 'v1' } })
    if (c.url === '/api/vehicles') return jsonRes({ data: [v] })
    if (c.url === '/api/vehicles/v1') return jsonRes({ data: { ...v, dailyChecks: [], maintenanceTasks: tasks, photos: [] } })
    return jsonRes({ data: [] })
  }))
}
async function openVehicleDrawer() {
  render(<ToastProvider><AdminVehiclesPage /></ToastProvider>)
  fireEvent.click(await screen.findByText('Truck 1'))
  return screen.findByRole('heading', { name: 'Truck 1' })
}

describe('vehicle drawer — derived and admin-owned states (D-g)', () => {
  it('ACTIVE: "Take out of service" confirms and PATCHes OUT_OF_SERVICE', async () => {
    stubVehicles('ACTIVE')
    await openVehicleDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Take out of service' }))
    const dlg = await screen.findByRole('dialog', { name: 'Take out of service?' })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Take out of service' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ status: 'OUT_OF_SERVICE' }))
    expect(screen.queryByRole('button', { name: 'Return to service' })).toBeNull()
  })

  it('OUT_OF_SERVICE: "Return to service" confirms and PATCHes ACTIVE', async () => {
    stubVehicles('OUT_OF_SERVICE')
    await openVehicleDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Return to service' }))
    const dlg = await screen.findByRole('dialog', { name: 'Return to service?' })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Return to service' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ url: '/api/vehicles/v1', body: { status: 'ACTIVE' } }))
  })

  it('IN_MAINTENANCE: read-only, the open repair linked, no service buttons', async () => {
    stubVehicles('IN_MAINTENANCE', [{ id: 't9', taskName: 'Cracked axle', status: 'IN_PROGRESS', nextDue: null, actualCost: null, isDamageReport: true, intervalValue: 0, deletedAt: null }])
    await openVehicleDrawer()
    const link = screen.getByRole('link', { name: 'Cracked axle' })
    expect(link).toHaveAttribute('href', '/admin/maintenance?task=t9')
    expect(screen.queryByRole('button', { name: 'Return to service' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Take out of service' })).toBeNull()
  })

  it('Edit form Status offers only Active / Out of service / Retired (In maintenance shown, disabled)', async () => {
    stubVehicles('IN_MAINTENANCE')
    await openVehicleDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const dlg = await screen.findByRole('dialog')
    fireEvent.mouseDown(within(dlg).getByRole('combobox', { name: 'Status' }))
    const options = await screen.findAllByRole('option')
    const labels = options.map((o) => o.textContent)
    expect(labels).toEqual(['IN MAINTENANCE', 'ACTIVE', 'OUT OF SERVICE', 'RETIRED'])
    expect(options[0]).toHaveAttribute('aria-disabled', 'true')
  })
})

// ── Inventory ─────────────────────────────────────────────────────────────────
const CAT = { id: 'c1', name: 'Sampling' }
const HUB = { id: 'h1', name: 'Home Lab', city: 'Austin', state: 'TX' }
const counts = { owned: 2, onHand: 2, available: 1, reserved: 0, out: 1, inMaintenance: 0, inoperable: 0, inTransit: 0, retired: 0 }
const ITEM = {
  id: 'i1', name: 'Rover', category: CAT, hub: HUB, sku: null, quantity: 2, unitCost: null, reorderUrl: null, supplier: null,
  location: null, qrCodeId: 'qr-i1', notes: null, lowStockThreshold: null, itemType: 'SERIALIZED', unitId: null,
  expectedQuantity: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', status: 'AVAILABLE',
  currentOperator: null, currentProject: null, activeProjects: [], derivedQuantity: 2, availableQuantity: 1,
  unitCounts: { totalUnits: 2, available: 1, checkedOut: 1, inMaintenance: 0, inoperable: 0, inTransit: 0, retired: 0 },
  itemCounts: counts, checkLogs: [], photos: [],
  units: [
    { id: 'u1', qrCodeId: 'q1', serialNumber: 'R-1', status: 'AVAILABLE', notes: null, createdAt: '2026-10-01T00:00:00Z', position: 1 },
    { id: 'u2', qrCodeId: 'q2', serialNumber: 'R-2', status: 'CHECKED_OUT', notes: null, createdAt: '2026-10-01T00:00:00Z', position: 2 },
  ],
}
const RETIRED_ITEM = { ...ITEM, id: 'i2', name: 'Old rover', status: 'RETIRED', units: [] }

function stubInventory(patchResponse: () => Promise<Response> = () => jsonRes({ data: {} })) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const c = record(input, init)
    if (c.method === 'PATCH') return patchResponse()
    if (c.url.startsWith('/api/inventory?')) {
      const data = c.url.includes('includeRetired=1') ? [ITEM, RETIRED_ITEM] : [ITEM]
      return jsonRes({ data, total: data.length, page: 1, pageSize: 100, truncated: false })
    }
    if (c.url === '/api/inventory/i1') return jsonRes({ data: ITEM })
    if (c.url === '/api/inventory/categories') return jsonRes({ data: [CAT] })
    if (c.url === '/api/inventory/hubs' || c.url === '/api/hubs') return jsonRes({ data: [HUB] })
    return jsonRes({ data: [] })
  }))
}
const renderInventory = async () => {
  render(<ToastProvider><AdminInventoryPage /></ToastProvider>)
  await screen.findByText('Rover')
}

describe('item retire (D-a · the BF-1 flow)', () => {
  it('row Retire → confirm copy → PATCH {status: RETIRED} → refetch without includeRetired → toast', async () => {
    stubInventory()
    await renderInventory()
    const row = screen.getByText('Rover').closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Retire' }))
    const dlg = await screen.findByRole('dialog', { name: 'Retire item?' })
    expect(dlg).toHaveTextContent('Retire "Rover"? Units on hand will be retired and their QR labels released. Units that are out or in repair block this. History is preserved.')
    const listCallsBefore = calls.filter((c) => c.url.startsWith('/api/inventory?')).length
    fireEvent.click(within(dlg).getByRole('button', { name: 'Retire' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ url: '/api/inventory/i1', body: { status: 'RETIRED' } }))
    expect(await screen.findByText('Rover retired')).toBeInTheDocument()
    await waitFor(() => expect(calls.filter((c) => c.url.startsWith('/api/inventory?')).length).toBeGreaterThan(listCallsBefore))
    expect(calls.filter((c) => c.url.startsWith('/api/inventory?')).at(-1)!.url).not.toContain('includeRetired')
  })

  it('a 409 is toasted with the server\'s words', async () => {
    stubInventory(() => jsonRes({ error: '1 unit is still out or in repair — get them back first.' }, 409))
    await renderInventory()
    fireEvent.click(within(screen.getByText('Rover').closest('tr')!).getByRole('button', { name: 'Retire' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Retire item?' })).getByRole('button', { name: 'Retire' }))
    expect(await screen.findByText('1 unit is still out or in repair — get them back first.')).toBeInTheDocument()
  })

  it('Show retired → includeRetired=1, a "Retired" chip, and no Retire on that row', async () => {
    stubInventory()
    await renderInventory()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show retired' }))
    const retiredRow = (await screen.findByText('Old rover')).closest('tr')!
    expect(calls.some((c) => c.url.startsWith('/api/inventory?') && c.url.includes('includeRetired=1'))).toBe(true)
    expect(within(retiredRow).getByText('Retired')).toBeInTheDocument()
    expect(within(retiredRow).queryByRole('button', { name: 'Retire' })).toBeNull()
  })
})

describe('Clear filters resets Show retired (BF-1)', () => {
  it('Show retired alone shows Clear filters, and clearing turns it off', async () => {
    stubInventory()
    await renderInventory()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
    const toggle = screen.getByRole('checkbox', { name: 'Show retired' })
    fireEvent.click(toggle)
    await screen.findByText('Old rover')
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Show retired' })).not.toBeChecked())
    await waitFor(() => expect(calls.filter((c) => c.url.startsWith('/api/inventory?')).at(-1)!.url).not.toContain('includeRetired'))
  })
})

describe('unit status by hand is only Available / Retired (D-g)', () => {
  it('an AVAILABLE unit offers Available and Retired (Retired confirmed); a CHECKED_OUT unit is a chip with its source', async () => {
    stubInventory()
    await renderInventory()
    fireEvent.click(screen.getByText('Rover'))
    fireEvent.click(await screen.findByRole('tab', { name: /^Units/ }))
    const r1 = (await screen.findByDisplayValue('R-1')).closest('tr')!
    fireEvent.mouseDown(within(r1).getByRole('combobox'))
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(options).toEqual(['Available', 'Retired'])
    // Choosing Retired asks first (it releases the QR label); nothing is sent until confirmed.
    fireEvent.click(screen.getByRole('option', { name: 'Retired' }))
    const confirm = await screen.findByRole('dialog', { name: 'Retire this unit?' })
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Retire Unit' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ url: '/api/inventory/units/u1', body: { status: 'RETIRED' } }))
    const r2 = screen.getByDisplayValue('R-2').closest('tr')!
    expect(within(r2).queryByRole('combobox')).toBeNull()
    expect(within(r2).getByText('via a deployment')).toBeInTheDocument()
  })
})

// ── DispositionDialog ─────────────────────────────────────────────────────────
describe('DispositionDialog preselect (S-2)', () => {
  it('a unit that is not plainly checked out starts on repair, not on a hub shelf', async () => {
    render(
      <DispositionDialog
        open mode="remove-items" deploymentId="d1" currentOperatorId="op1" operators={[]}
        hubs={[{ id: 'hub1', name: 'Home Lab', city: 'Austin', state: 'TX' }]}
        items={[
          { kitItemId: 'k1', itemId: 'i1', name: 'Broken drill', quantity: 1, itemType: 'SERIALIZED', inventoryUnit: { id: 'u1', qrCodeId: 'Q1', serialNumber: 'S1', status: 'IN_MAINTENANCE' } },
          { kitItemId: 'k2', itemId: 'i2', name: 'Fine drill', quantity: 1, itemType: 'SERIALIZED', inventoryUnit: { id: 'u2', qrCodeId: 'Q2', serialNumber: 'S2', status: 'CHECKED_OUT' } },
        ]}
        onComplete={() => {}} onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Return Items/i }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    const disps = (mutate.mock.calls[0][0].body as { itemDispositions: { kitItemId: string; type: string; canBeFixed?: boolean }[] }).itemDispositions
    expect(disps.find((d) => d.kitItemId === 'k1')).toMatchObject({ type: 'INOPERABLE', canBeFixed: true })
    expect(disps.find((d) => d.kitItemId === 'k2')).toMatchObject({ type: 'HUB' })
  })
})

// ── Scan ──────────────────────────────────────────────────────────────────────
describe('scan: an applied field fix refreshes the panel (U-8)', () => {
  it('re-reads the scanned vehicle after the fix — Active without a re-scan', async () => {
    let vehicleStatus = 'IN_MAINTENANCE'
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const c = record(input, init)
      if (c.url.startsWith('/api/inventory/units/by-qr/')) return jsonRes({ error: 'nf' }, 404)
      if (c.url.startsWith('/api/vehicles/by-qr/')) {
        return jsonRes({ vehicle: { id: 'v1', name: 'Truck 1', type: 'TRUCK', status: vehicleStatus, qrCodeId: 'VEH-QR', location: null, odometer: 10 } })
      }
      return jsonRes([])
    }))
    mutate.mockImplementationOnce(async () => { vehicleStatus = 'ACTIVE'; return { ok: true, queued: false, data: {} } })
    render(<ToastProvider><OperatorScanPage /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: /scan/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'fake scan' }))
    await screen.findByText('Truck 1')
    fireEvent.click(screen.getByRole('button', { name: 'Log fixed issue' }))
    const dlg = await screen.findByRole('dialog')
    expect(dlg).toHaveTextContent('Any open report for this vehicle is closed and it goes back in service, unless an admin took it out of service.')
    fireEvent.change(within(dlg).getByRole('textbox'), { target: { value: 'tightened the hose' } })
    fireEvent.click(within(dlg).getByRole('button', { name: /Log fix/ }))
    await waitFor(() => expect(calls.filter((c) => c.url.startsWith('/api/vehicles/by-qr/')).length).toBe(2))
    expect(await screen.findByText('Active')).toBeInTheDocument()
  })
})
