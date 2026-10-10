import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider } from '@/components/shared/useToast'

// PR-6 (D49 · D-v/D-w/D-x/D-y/D-g′): Repair and Retire are for serialized gear.
// Driven through the real pages (the inventory-delete / sched-link harnesses):
//  - a consumable row is Edit · Delete; its drawer has no Retire and no Units tab;
//  - the Delete dialog on a consumable says consumables aren't retired;
//  - Send for repair on an Available or Inoperable unit, nothing else;
//  - the type field locks once the item has units or stock;
//  - the Maintenance pickers offer serialized items only;
//  - DispositionDialog / Return Item offer Write off for a consumable.

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/admin/inventory',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/hooks/useHistoryGuard', () => ({ useHistoryGuard: () => {} }))
type MutateArg = { endpoint: string; method: string; body: { note: string; itemDispositions: Record<string, unknown>[] } }
const mutate = vi.fn(async (_opts: MutateArg) => ({ ok: true, queued: false, data: {} }))
vi.mock('@/hooks/useOfflineQueue', () => ({ useOfflineQueue: () => ({ mutate, isOffline: false }) }))
vi.mock('@/components/shared/PhotoCapture', () => ({ PhotoCapture: () => null }))

import AdminInventoryPage from '@/app/(admin)/admin/inventory/page'
import AdminMaintenancePage from '@/app/(admin)/admin/maintenance/page'
import AdminDeploymentsPage from '@/app/(admin)/admin/deployments/page'
import { DispositionDialog, type KitItemSummary } from '@/components/shared/DispositionDialog'
import { copy } from '@/lib/copy/admin-actions'

const NO_UNITS = { totalUnits: 0, available: 0, checkedOut: 0, inMaintenance: 0, inoperable: 0, inTransit: 0, retired: 0 }
const counts = (owned: number) => ({ owned, onHand: owned, available: owned, reserved: 0, out: 0, inMaintenance: 0, inoperable: 0, inTransit: 0, retired: 0 })

const row = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, category: { id: 'c1', name: 'Sampling' }, hub: null, sku: null, quantity: 0, unitCost: null,
  reorderUrl: null, supplier: null, location: null, qrCodeId: `qr-${id}`, notes: null, lowStockThreshold: null,
  itemType: 'SERIALIZED', status: 'AVAILABLE', unitId: null, expectedQuantity: null,
  createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z',
  currentOperator: null, currentProject: null, activeProjects: [], unitCounts: NO_UNITS, units: [],
  derivedQuantity: 0, availableQuantity: 0, itemCounts: counts(0), checkLogs: [], photos: [], ...extra,
})

const unit = (id: string, status: string, position: number) => ({
  id, qrCodeId: `qr-${id}`, serialNumber: `SN-${id}`, status, notes: null, createdAt: '2026-10-01T12:00:00Z', position,
})
const STATUSES = ['AVAILABLE', 'INOPERABLE', 'CHECKED_OUT', 'IN_TRANSIT', 'IN_MAINTENANCE']
const GPS_UNITS = STATUSES.map((s, i) => unit(`u-${s.toLowerCase()}`, s, i + 1))

const GPS = row('i-gps', 'GPS rover', {
  units: GPS_UNITS,
  unitCounts: { ...NO_UNITS, totalUnits: 5, available: 1, checkedOut: 1, inMaintenance: 1, inoperable: 1, inTransit: 1 },
  itemCounts: counts(5),
})
const BAGS = row('i-bags', 'Sample bags', { itemType: 'CONSUMABLE', quantity: 40, itemCounts: counts(40) })
const BARE = row('i-bare', 'New thing', { itemType: 'CONSUMABLE' })
const LEGACY = row('i-legacy', 'Old flags', {
  itemType: 'CONSUMABLE', units: [unit('u-flag', 'AVAILABLE', 1)],
  unitCounts: { ...NO_UNITS, totalUnits: 1, available: 1 },
})
const ITEMS: Record<string, ReturnType<typeof row>> = { 'i-gps': GPS, 'i-bags': BAGS, 'i-bare': BARE, 'i-legacy': LEGACY }

type Call = { method: string; url: string; body: Record<string, unknown> | null }
let calls: Call[] = []

const jsonRes = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body } as Response)

function stubInventory() {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null })
    if (method !== 'GET') return jsonRes({ ok: true })
    if (url.startsWith('/api/inventory?')) return jsonRes({ data: Object.values(ITEMS), total: 4 })
    const detail = /^\/api\/inventory\/([^/?]+)$/.exec(url)
    if (detail && ITEMS[detail[1]!]) return jsonRes({ data: ITEMS[detail[1]!] })
    if (url.endsWith('/references')) return jsonRes({ data: { itemType: 'CONSUMABLE', references: {}, units: {}, stock: { onHand: 40, hubs: 2 }, history: {} } })
    if (url === '/api/inventory/categories') return jsonRes({ data: [{ id: 'c1', name: 'Sampling' }] })
    if (url === '/api/inventory/hubs') return jsonRes({ data: [] })
    return jsonRes({ data: [] })
  }))
}

async function renderInventory() {
  render(<ToastProvider><AdminInventoryPage /></ToastProvider>)
  await screen.findByText('GPS rover')
}
const rowOf = (name: string) => screen.getByText(name).closest('tr')!
async function openDrawer(name: string) {
  fireEvent.click(screen.getByText(name))
  // The drawer header repeats the name once the detail has loaded.
  await waitFor(() => expect(screen.getAllByText(name).length).toBeGreaterThan(1))
}

beforeEach(() => {
  calls = []
  mutate.mockClear()
  window.history.replaceState(null, '', '/admin/inventory')
})
afterEach(() => { vi.unstubAllGlobals() })

describe('PR-6 · Inventory: Retire and Units are for serialized gear', () => {
  beforeEach(stubInventory)

  it('a consumable row is Edit · Delete with no Retire; a serialized row still offers Retire', async () => {
    await renderInventory()
    const bags = within(rowOf('Sample bags'))
    expect(bags.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(bags.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(bags.queryByRole('button', { name: 'Retire' })).toBeNull()
    expect(within(rowOf('GPS rover')).getByRole('button', { name: 'Retire' })).toBeInTheDocument()
  })

  it('a consumable drawer has no Retire and no Units tab; a serialized drawer has both', async () => {
    await renderInventory()
    await openDrawer('Sample bags')
    expect(screen.getByRole('tab', { name: 'Info' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'History' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /^Units/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retire' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Delete' }).length).toBeGreaterThan(0)
    // History is still History (the tabs keep explicit values when Units is hidden).
    fireEvent.click(screen.getByRole('tab', { name: 'History' }))
    expect(await screen.findByText('No check logs yet.')).toBeInTheDocument()
  })

  it('a consumable with legacy units shows them read-only, with no Add Unit', async () => {
    await renderInventory()
    await openDrawer('Old flags')
    fireEvent.click(screen.getByRole('tab', { name: /^Units/ }))
    expect(await screen.findByText('Legacy units — this item is a consumable, so no more can be added.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add Unit/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send for repair' })).toBeNull()
  })

  it('the Delete dialog on a consumable says consumables are deleted, not retired; a serialized item keeps item.delete', async () => {
    await renderInventory()
    fireEvent.click(within(rowOf('Sample bags')).getByRole('button', { name: 'Delete' }))
    let dlg = await screen.findByRole('dialog', { name: 'Delete item?' })
    expect(dlg).toHaveTextContent(copy('item.deleteConsumable').message('Sample bags'))
    expect(await within(dlg).findByText('40 on hand at 2 hubs go with it.')).toBeInTheDocument()
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete item?' })).toBeNull())

    fireEvent.click(within(rowOf('GPS rover')).getByRole('button', { name: 'Delete' }))
    dlg = await screen.findByRole('dialog', { name: 'Delete item?' })
    expect(dlg).toHaveTextContent(copy('item.delete').message('GPS rover'))
  })

  it('Send for repair is offered on an Available and an Inoperable unit only, and posts to review-inoperable', async () => {
    await renderInventory()
    await openDrawer('GPS rover')
    fireEvent.click(screen.getByRole('tab', { name: /^Units/ }))
    const unitRow = (status: string) => screen.getByDisplayValue(`SN-u-${status.toLowerCase()}`).closest('tr')!
    await waitFor(() => expect(unitRow('AVAILABLE')).toBeTruthy())
    expect(within(unitRow('AVAILABLE')).getByRole('button', { name: 'Send for repair' })).toBeInTheDocument()
    expect(within(unitRow('INOPERABLE')).getByRole('button', { name: 'Send for repair' })).toBeInTheDocument()
    for (const s of ['CHECKED_OUT', 'IN_TRANSIT', 'IN_MAINTENANCE']) {
      expect(within(unitRow(s)).queryByRole('button', { name: 'Send for repair' })).toBeNull()
    }
    // Retire-this-unit stays on Inoperable only.
    expect(within(unitRow('AVAILABLE')).queryByRole('button', { name: 'Retire this unit' })).toBeNull()
    expect(within(unitRow('INOPERABLE')).getByRole('button', { name: 'Retire this unit' })).toBeInTheDocument()

    fireEvent.click(within(unitRow('AVAILABLE')).getByRole('button', { name: 'Send for repair' }))
    const dlg = await screen.findByRole('dialog', { name: 'Send for Repair' })
    fireEvent.click(within(dlg).getByLabelText('Take it to a shop'))
    fireEvent.change(within(dlg).getByLabelText(/Admin note/), { target: { value: 'Cracked housing' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Send for Repair' }))
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST' && c.url === '/api/inventory/i-gps/review-inoperable')).toHaveLength(1))
    expect(calls.find((c) => c.url === '/api/inventory/i-gps/review-inoperable')!.body).toMatchObject({ unitId: 'u-available', decision: 'REPAIR' })
  })

  it('the type field is locked with the reason once the item has units or stock — and still submits its value', async () => {
    await renderInventory()
    fireEvent.click(within(rowOf('Sample bags')).getByRole('button', { name: 'Edit' }))
    let dlg = await screen.findByRole('dialog', { name: 'Edit item' })
    expect(within(dlg).getByLabelText('Consumable')).toBeDisabled()
    expect(within(dlg).getByLabelText('Serialized Item')).toBeDisabled()
    expect(within(dlg).getByText('Type is fixed once an item has units or stock.')).toBeInTheDocument()
    fireEvent.change(within(dlg).getByLabelText(/^Name/), { target: { value: 'Sample bags (large)' } })
    fireEvent.click(within(dlg).getByRole('button', { name: /^Save/ }))
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1))
    expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ itemType: 'CONSUMABLE' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit item' })).toBeNull())

    // A bare item (no units, no stock) can still be corrected.
    fireEvent.click(within(rowOf('New thing')).getByRole('button', { name: 'Edit' }))
    dlg = await screen.findByRole('dialog', { name: 'Edit item' })
    expect(within(dlg).getByLabelText('Serialized Item')).toBeEnabled()
    expect(within(dlg).queryByText('Type is fixed once an item has units or stock.')).toBeNull()
  })
})

describe('PR-6 · Maintenance pickers list serialized items only (D-v)', () => {
  const OPTIONS = [
    { id: 'i-gps', name: 'GPS rover', itemType: 'SERIALIZED', categoryName: 'Instruments', pickableUnits: [{ id: 'u1', serialNumber: null, qrCodeId: 'q1', status: 'AVAILABLE', position: 1 }], availableByHub: [] },
    { id: 'i-bags', name: 'Sample bags', itemType: 'CONSUMABLE', categoryName: 'Sampling', pickableUnits: [], availableByHub: [{ hubId: 'h1', hubName: 'Hub', quantity: 40, reservedQty: 0, available: 40 }] },
  ]
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/vehicles') return jsonRes({ data: [{ id: 'v1', name: 'Truck 1' }] })
      if (url.startsWith('/api/inventory?mode=options')) return jsonRes({ data: OPTIONS })
      if (url.startsWith('/api/hubs')) return jsonRes([])
      if (url.startsWith('/api/deployments')) return jsonRes([])
      return jsonRes({ data: [] })
    }))
  })

  async function itemOptions(dialog: HTMLElement) {
    fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: /^Item/ }))
    return (await screen.findAllByRole('option')).map((o) => o.textContent)
  }

  it('Add scheduled task: a consumable deep link opens with no item selected, and only serialized items are offered', async () => {
    window.history.replaceState(null, '', '/admin/maintenance?sched=item:i-bags')
    render(<ToastProvider><AdminMaintenancePage /></ToastProvider>)
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/mode=options/)))
    // The deep-linked consumable is not pre-selected (no client-side copy of the D-v text).
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: /^Item/ })).not.toHaveTextContent('Sample bags'))
    expect(within(dialog).queryByDisplayValue('Sample bags')).toBeNull()
    expect(await itemOptions(dialog)).toEqual(['GPS rover'])
  })

  it('Log field fix: only serialized items are offered', async () => {
    render(<ToastProvider><AdminMaintenancePage /></ToastProvider>)
    fireEvent.click(await screen.findByRole('button', { name: /Log field fix/i }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/mode=options/)))
    fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: /^Subject/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'Inventory item' }))
    expect(await itemOptions(dialog)).toEqual(['GPS rover'])
  })
})

describe('PR-6 · DispositionDialog: a damaged consumable is written off (D-x)', () => {
  const ITEMS_KIT: KitItemSummary[] = [
    { kitItemId: 'ki-bags', itemId: 'i-bags', name: 'Sample bags', quantity: 5, itemType: 'CONSUMABLE', inventoryUnit: null },
    { kitItemId: 'ki-gps', itemId: 'i-gps', name: 'GPS rover', quantity: 1, itemType: 'SERIALIZED',
      inventoryUnit: { id: 'u1', qrCodeId: 'QR1', serialNumber: 'SN-1', status: 'CHECKED_OUT' } },
  ]
  const renderDialog = () => render(
    <DispositionDialog open mode="end-deployment" deploymentId="d1" currentOperatorId="op1" operators={[]}
      hubs={[{ id: 'hub1', name: 'Home Lab', city: 'Austin', state: 'TX' }]} items={ITEMS_KIT}
      onComplete={() => {}} onClose={() => {}} />,
  )
  const dispositionSelect = (name: string) =>
    within(screen.getByText(name).closest('div')!.parentElement!).getByRole('combobox', { name: /Disposition/ })

  it('a consumable line offers Return to Hub · Transfer to Operator · Write off; Write off has no fixable question and goes without canBeFixed', async () => {
    renderDialog()
    fireEvent.mouseDown(dispositionSelect('Sample bags'))
    const opts = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(opts).toEqual(['Return to Hub', 'Transfer to Operator', 'Write off'])
    fireEvent.click(screen.getByRole('option', { name: 'Write off' }))
    expect(screen.queryByLabelText(/Can it be fixed/)).toBeNull()
    expect(screen.getByText('Damage photos — add at least one if you can')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'End Deployment' }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    const sent = mutate.mock.calls[0]![0].body.itemDispositions.find((d) => d.kitItemId === 'ki-bags')!
    expect(sent.type).toBe('INOPERABLE')
    expect('canBeFixed' in sent).toBe(false)
  })

  it('a serialized line is unchanged: Mark Inoperable / Damaged with the fixable question', async () => {
    renderDialog()
    fireEvent.mouseDown(dispositionSelect('GPS rover'))
    const opts = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(opts).toEqual(['Return to Hub', 'Transfer to Operator', 'Mark Inoperable / Damaged'])
    fireEvent.click(screen.getByRole('option', { name: 'Mark Inoperable / Damaged' }))
    expect(screen.getByLabelText(/Can it be fixed/)).toBeInTheDocument()
  })
})

describe('PR-6 · Admin Return Item: a consumable offers Good · Write off', () => {
  const RIG = {
    id: 'rig-1', label: null, startedAt: '2026-09-01T10:00:00Z', endedAt: null,
    operator: { id: 'u1', name: 'Op One' }, project: null, vehicles: [], secondaryOperators: [],
    kits: [{ id: 'k1', items: [
      { id: 'ki-bags', quantity: 5, inventoryUnit: null, item: { id: 'i-bags', name: 'Sample bags', itemType: 'CONSUMABLE', categoryRef: null } },
      { id: 'ki-gps', quantity: 1, inventoryUnit: { id: 'u1', serialNumber: 'SN-1', qrCodeId: 'QR1', status: 'CHECKED_OUT' }, item: { id: 'i-gps', name: 'GPS rover', itemType: 'SERIALIZED', categoryRef: null } },
    ] }],
  }
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/deployments/rig-1') return jsonRes({ ...RIG, openTasks: [] })
      if (url.startsWith('/api/deployments/') && url.endsWith('/history')) return jsonRes({ data: [] })
      if (url.startsWith('/api/deployments')) return jsonRes([RIG])
      if (url.startsWith('/api/transfers')) return jsonRes([])
      if (url === '/api/hubs') return jsonRes([])
      return jsonRes({ data: [] })
    }))
  })

  async function conditionOptions(itemName: string) {
    const itemRow = screen.getByText(itemName).closest('li') ?? screen.getByText(itemName).parentElement!.parentElement!
    fireEvent.click(within(itemRow as HTMLElement).getByRole('button', { name: 'Return item' }))
    const dlg = await screen.findByRole('dialog', { name: 'Return Item' })
    fireEvent.mouseDown(within(dlg).getByRole('combobox'))
    const opts = (await screen.findAllByRole('option')).map((o) => o.textContent)
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Return Item' })).toBeNull())
    return opts
  }

  it('consumable: Good · Write off; serialized: the full list, unchanged', async () => {
    render(<ToastProvider><AdminDeploymentsPage /></ToastProvider>)
    fireEvent.click(await screen.findByText('Op One'))
    await screen.findByText('Sample bags')
    expect(await conditionOptions('Sample bags')).toEqual(['Good', 'Write off'])
    expect(await conditionOptions('GPS rover')).toEqual(['Good', 'Needs maintenance', 'Inoperable'])
  })
})
