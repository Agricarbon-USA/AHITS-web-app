import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { ToastProvider } from '@/components/shared/useToast'

// P1-1b · Screens tell the truth. 3.2 the transfer note survives a failure · 3.3 the
// return dialog (no pre-picked hub, waiting gear, the person rule) · 3.4 Scan names its
// hub · 3.5 admin deployments · 3.6 date-only values · 3.7 a crewmate's check.

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
vi.mock('@/hooks/useHistoryGuard', () => ({ useHistoryGuard: () => {} }))
type MutateArg = { endpoint: string; method: string; body: { note?: string; itemDispositions?: Record<string, unknown>[]; [k: string]: unknown }; label?: string }
const mutate = vi.fn(async (_opts: MutateArg) => ({ ok: true, queued: false, data: {} }))
vi.mock('@/hooks/useOfflineQueue', () => ({ useOfflineQueue: () => ({ mutate, isOffline: false, pending: 0 }) }))
// A photo stand-in the test can add to (the real one touches the browser photo store).
vi.mock('@/components/shared/PhotoCapture', () => ({
  PhotoCapture: ({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) => (
    <button type="button" onClick={() => onChange([...value, `photo-${value.length + 1}`])}>{`Photos: ${value.length}`}</button>
  ),
}))
vi.mock('@/components/shared/QrScannerDialog', () => ({
  QrScannerDialog: ({ open, onResolve }: { open: boolean; onResolve: (c: string) => Promise<unknown> }) =>
    open ? <button onClick={() => { void onResolve('UNIT-QR') }}>fake scan</button> : null,
}))

import { DispositionDialog, type KitItemSummary, type WaitingMap } from '@/components/shared/DispositionDialog'
import { TransferDialog } from '@/components/shared/TransferDialog'
import OperatorScanPage from '@/app/(operator)/operator/scan/page'
import AdminDeploymentsPage from '@/app/(admin)/admin/deployments/page'
import AdminVehiclesPage from '@/app/(admin)/admin/vehicles/page'
import OperatorDailyCheckPage from '@/app/(operator)/operator/daily-check/page'
import { formatDay, toDay } from '@/lib/utils'

const jsonRes = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body } as Response)
type Call = { url: string; method: string; body: Record<string, unknown> | null }
let calls: Call[] = []
const record = (input: RequestInfo | URL, init?: RequestInit) => {
  const c = { url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null }
  calls.push(c)
  return c
}
beforeEach(() => { calls = []; mutate.mockClear(); window.history.replaceState(null, '', '/') })
afterEach(() => { vi.unstubAllGlobals() })

const HUBS = [
  { id: 'hub1', name: 'Home Lab', city: 'Piedmont', state: 'SC' },
  { id: 'hub2', name: 'YS Shop', city: 'Toledo', state: 'OH' },
]
const PEOPLE = [
  { id: 'op1', name: 'Owen Operator', role: 'OPERATOR' },
  { id: 'op2', name: 'Xena Recipient', role: 'OPERATOR' },
]
const pick = (combo: HTMLElement, option: RegExp | string) => {
  fireEvent.mouseDown(combo)
  fireEvent.click(within(screen.getByRole('listbox')).getByText(option))
}
const lineOf = (name: string) => screen.getByText(name).closest('div')!.parentElement! as HTMLElement

// ─── 3.2 · NotePhotoDialog keeps the work ───────────────────────────────────────────
describe('3.2 · a failed transfer keeps the note and photos', () => {
  const RIG = {
    id: 'rig1',
    vehicles: [],
    kits: [{ items: [{ id: 'k1', quantity: 1, item: { name: 'GPS rover', itemType: 'SERIALIZED' }, inventoryUnit: null }] }],
  }
  it('a 400 shows the server words and the note and photos are still there', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonRes({ error: 'Pick a person to transfer to.' }, 400)))
    const showToast = vi.fn()
    render(<TransferDialog rig={RIG} operators={PEOPLE} onClose={() => {}} onSuccess={() => {}} showToast={showToast} />)
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Person' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Xena Recipient' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Note' }))
    fireEvent.change(await screen.findByRole('textbox', { name: /Note/ }), { target: { value: 'leaving at noon' } })
    fireEvent.click(screen.getByRole('button', { name: 'Photos: 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    await waitFor(() => expect(showToast).toHaveBeenCalledWith({ message: 'Pick a person to transfer to.', severity: 'error' }))
    expect(screen.getByRole('textbox', { name: /Note/ })).toHaveValue('leaving at noon')
    expect(screen.getByRole('button', { name: 'Photos: 1' })).toBeInTheDocument()
  })

  it('a waiting line is neither shown nor sent', async () => {
    const two = { ...RIG, kits: [{ items: [...RIG.kits[0]!.items, { id: 'k2', quantity: 1, item: { name: 'Corer', itemType: 'SERIALIZED' }, inventoryUnit: null }] }] }
    vi.stubGlobal('fetch', vi.fn((i: RequestInfo | URL, init?: RequestInit) => { record(i, init); return jsonRes({ ok: true }, 201) }))
    render(<TransferDialog rig={two} operators={PEOPLE} onClose={() => {}} onSuccess={() => {}} showToast={() => {}}
      waiting={{ items: { k1: { qty: null, toName: 'Xena Recipient' } }, vehicles: {} }} />)
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Person' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Owen Operator' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.queryByText('GPS rover')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Note' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Transfer' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect((calls[0]!.body!.items as { kitItemId: string }[]).map((i) => i.kitItemId)).toEqual(['k2'])
  })
})

// ─── 3.3 · DispositionDialog ────────────────────────────────────────────────────────
const unitLine = (id: string, name: string, status = 'CHECKED_OUT'): KitItemSummary => ({
  kitItemId: id, itemId: `i-${id}`, name, quantity: 1, itemType: 'SERIALIZED',
  inventoryUnit: { id: `u-${id}`, qrCodeId: `Q-${id}`, serialNumber: null, status },
})
const countedLine = (id: string, name: string, quantity: number, drawnHubId: string | null = 'hub1'): KitItemSummary => ({
  kitItemId: id, itemId: `i-${id}`, name, quantity, itemType: 'CONSUMABLE', inventoryUnit: null, drawnHubId,
})

function renderDisposition(items: KitItemSummary[], extra: Partial<React.ComponentProps<typeof DispositionDialog>> = {}) {
  return render(
    <DispositionDialog open mode="end-deployment" deploymentId="d1" currentOperatorId="op1" operators={PEOPLE}
      hubs={HUBS} items={items} onComplete={() => {}} onClose={() => {}} {...extra} />,
  )
}
const sentLines = () => mutate.mock.calls[0]![0].body.itemDispositions as Record<string, unknown>[]
const sent = (id: string) => sentLines().find((d) => d.kitItemId === id)

describe('3.3 · every return names its hub; nothing is pre-picked', () => {
  it('with 2 hubs nothing is selected, and submit reads "Pick a return hub"', () => {
    renderDisposition([unitLine('a', 'GPS rover'), unitLine('b', 'Corer')])
    for (const c of screen.getAllByRole('combobox', { name: /Return hub/ })) expect(c).toHaveTextContent(/^(​|\s)*$/)
    expect(screen.getByRole('button', { name: 'Pick a return hub' })).toBeDisabled()
  })

  it('a line picked on itself keeps its hub; "Return everything to" fills the rest, fixable damage too', async () => {
    renderDisposition([unitLine('a', 'GPS rover'), unitLine('b', 'Corer'), unitLine('c', 'Drill', 'IN_MAINTENANCE')])
    pick(within(lineOf('GPS rover')).getByRole('combobox', { name: /Return hub/ }), /Home Lab/)
    const all = () => screen.getByRole('combobox', { name: /Return everything to/ })
    pick(all(), /Home Lab/)
    pick(all(), /YS Shop/)
    fireEvent.click(screen.getByRole('button', { name: 'End Deployment' }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(sent('a')).toMatchObject({ type: 'HUB', hubId: 'hub1' })
    expect(sent('b')).toMatchObject({ type: 'HUB', hubId: 'hub2' })
    expect(sent('c')).toMatchObject({ type: 'INOPERABLE', canBeFixed: true, hubId: 'hub2' })
  })

  it('Transfer and Write off need no hub (regression guard)', async () => {
    renderDisposition([unitLine('a', 'GPS rover'), countedLine('b', 'Sample bags', 3)])
    pick(within(lineOf('GPS rover')).getByRole('combobox', { name: /Disposition/ }), /^Transfer to/)
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Person' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Xena Recipient' }))
    pick(within(lineOf('Sample bags')).getByRole('combobox', { name: /Disposition/ }), 'Write off')
    fireEvent.click(screen.getByRole('button', { name: 'End Deployment' }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(sent('a')).toMatchObject({ type: 'TRANSFER', toOperatorId: 'op2' })
    expect('hubId' in sent('a')!).toBe(false)
    expect('hubId' in sent('b')!).toBe(false)
  })

  it('fixable damage needs a hub', () => {
    renderDisposition([unitLine('a', 'GPS rover')])
    pick(screen.getByRole('combobox', { name: /Disposition/ }), 'Mark Inoperable / Damaged')
    expect(screen.queryByRole('combobox', { name: /Return hub/ })).toBeNull()
    pick(screen.getByRole('combobox', { name: /Can it be fixed/ }), /^Yes/)
    expect(screen.getByRole('combobox', { name: /Return hub/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pick a return hub' })).toBeDisabled()
  })

  it('a counted line hints where it came from, and never pre-selects it', () => {
    renderDisposition([countedLine('a', 'Sample bags', 3, 'hub2')])
    expect(screen.getByText('Pick a hub · came from YS Shop')).toBeInTheDocument()
    pick(screen.getByRole('combobox', { name: /Return hub/ }), /Home Lab/)
    expect(screen.getByText('Came from YS Shop')).toBeInTheDocument()
  })

  it('"Transfer to a person" with nobody picked reads "Pick a person" and sends nothing; the own operator is not offered', async () => {
    renderDisposition([unitLine('a', 'GPS rover')])
    pick(screen.getByRole('combobox', { name: /Disposition/ }), 'Transfer to a person')
    const submit = screen.getByRole('button', { name: 'Pick a person' })
    expect(submit).toBeDisabled()
    fireEvent.click(submit)
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Person' }))
    const people = await screen.findByRole('listbox', { name: 'Person' })
    expect(within(people).getAllByRole('option').map((o) => o.textContent)).toEqual(['Xena Recipient'])
  })

  it('hubId is not sent on a line switched from Return to Hub to Transfer', async () => {
    renderDisposition([unitLine('a', 'GPS rover')])
    pick(screen.getByRole('combobox', { name: /Return hub/ }), /Home Lab/)
    pick(screen.getByRole('combobox', { name: /Disposition/ }), 'Transfer to a person')
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Person' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Xena Recipient' }))
    fireEvent.click(screen.getByRole('button', { name: 'End Deployment' }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(sent('a')).not.toHaveProperty('hubId')
  })

  it('End shows no quantity field', () => {
    renderDisposition([countedLine('a', 'Sample bags', 5)])
    expect(screen.queryByLabelText(/Quantity to remove/)).toBeNull()
  })
})

describe('3.3 · gear waiting on a transfer (§0-s)', () => {
  const waiting: WaitingMap = {
    items: { a: { qty: null, toName: 'Xena Recipient' }, b: { qty: 3, toName: 'Xena Recipient' } },
    vehicles: {},
  }
  it('a wholly waiting line reads "Waiting on transfer to X" and is not sent; a partly waiting one picks for the rest', async () => {
    renderDisposition([unitLine('a', 'GPS rover'), countedLine('b', 'Sample bags', 10)], { waiting })
    expect(within(lineOf('GPS rover')).getByText('Waiting on transfer to Xena Recipient')).toBeInTheDocument()
    expect(within(lineOf('GPS rover')).queryByRole('combobox')).toBeNull()
    expect(screen.getByText('3 waiting on transfer to Xena Recipient — the rest:')).toBeInTheDocument()
    fireEvent.mouseDown(within(lineOf('Sample bags')).getByRole('combobox', { name: /Disposition/ }))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Return to Hub', 'Write off'])
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    pick(within(lineOf('Sample bags')).getByRole('combobox', { name: /Return hub/ }), /Home Lab/)
    fireEvent.click(screen.getByRole('button', { name: 'End Deployment' }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(sentLines().map((d) => d.kitItemId)).toEqual(['b'])
  })

  it('in remove-items, a partly waiting line returns at most its free part', async () => {
    renderDisposition([countedLine('b', 'Sample bags', 10)], { waiting, mode: 'remove-items' })
    expect(screen.getByLabelText(/Quantity to remove/)).toHaveValue(7)
    pick(screen.getByRole('combobox', { name: /Return hub/ }), /Home Lab/)
    fireEvent.click(screen.getByRole('button', { name: 'Return Items' }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(sent('b')).toMatchObject({ quantity: 7, hubId: 'hub1' })
  })

  it('in remove-items with only waiting lines, submit is disabled and says to cancel first', () => {
    renderDisposition([unitLine('a', 'GPS rover')], { waiting, mode: 'remove-items' })
    expect(screen.getByText('Waiting on transfer to Xena Recipient — cancel that transfer first.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Return Items' })).toBeDisabled()
  })

  it('a legacy serialized line with no unit, partly waiting, is held and says why', () => {
    const legacy: KitItemSummary = { kitItemId: 'L', itemId: 'iL', name: 'Old flags', quantity: 4, itemType: 'SERIALIZED', inventoryUnit: null }
    renderDisposition([legacy], { waiting: { items: { L: { qty: 1, toName: 'Xena Recipient' } }, vehicles: {} } })
    expect(screen.getByText('Waiting on transfer to Xena Recipient — answer or cancel that transfer before ending.')).toBeInTheDocument()
  })
})

// ─── 3.4 · Scan ─────────────────────────────────────────────────────────────────────
describe('3.4 · Scan → Return to Hub asks for the hub', () => {
  it('is disabled until a hub is picked; the DELETE carries hubId and the toast names the hub', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const c = record(input, init)
      if (c.url === '/api/hubs') return jsonRes({ data: HUBS })
      if (c.url === '/api/deployments/mine') {
        return jsonRes({ data: { id: 'rig1', kits: [{ items: [{ id: 'k1', inventoryUnitId: 'u1', inventoryItemId: 'i1' }] }] } })
      }
      if (c.url.startsWith('/api/inventory/units/by-qr/')) {
        return jsonRes({ unit: { id: 'u1', qrCodeId: 'UNIT-QR', serialNumber: 'SN-1', status: 'CHECKED_OUT', notes: null }, item: { id: 'i1', name: 'GPS rover', itemType: 'SERIALIZED', category: { name: 'Sampling' } } })
      }
      return jsonRes({ data: [] })
    }))
    render(<ToastProvider><OperatorScanPage /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: /scan/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'fake scan' }))
    await screen.findByText('GPS rover')
    const ret = await screen.findByRole('button', { name: 'Return to Hub' })
    expect(ret).toBeDisabled()
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Return hub/ })).not.toHaveAttribute('aria-disabled', 'true'))
    pick(screen.getByRole('combobox', { name: /Return hub/ }), /YS Shop/)
    fireEvent.click(screen.getByRole('button', { name: 'Return to Hub' }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(mutate.mock.calls[0]![0]).toMatchObject({ endpoint: '/api/deployments/rig1/items/k1', method: 'DELETE', body: { returnCondition: 'GOOD', hubId: 'hub2' }, label: 'Return GPS rover to YS Shop' })
    expect(await screen.findByText('GPS rover returned to YS Shop.')).toBeInTheDocument()
  })
})

// ─── 3.5 · Admin deployments ────────────────────────────────────────────────────────
describe('3.5 · admin deployments', () => {
  const RIG = {
    id: 'rig-1', label: null, startedAt: '2026-09-01T10:00:00Z', endedAt: null,
    operator: { id: 'op1', name: 'Owen Operator' }, project: null, secondaryOperators: [],
    vehicles: [{ id: 'rv1', vehicle: { id: 'v1', name: 'Truck 1', type: 'TRUCK', isRental: false, status: 'ACTIVE' } }],
    kits: [{ id: 'k1', items: [
      { id: 'ki-bags', quantity: 2, drawnHubId: 'hub2', inventoryUnit: null, item: { id: 'i-bags', name: 'Sample bags', itemType: 'CONSUMABLE', categoryRef: null } },
      { id: 'ki-gps', quantity: 1, inventoryUnit: { id: 'u1', serialNumber: 'SN-1', qrCodeId: 'QR1', status: 'CHECKED_OUT' }, item: { id: 'i-gps', name: 'GPS rover', itemType: 'SERIALIZED', categoryRef: null } },
    ] }],
  }
  let transfers: unknown[] = []
  beforeEach(() => {
    transfers = []
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const c = record(input, init)
      if (c.method !== 'GET') return jsonRes({ ok: true })
      if (c.url === '/api/deployments/rig-1') return jsonRes({ ...RIG, openTasks: [] })
      if (c.url.startsWith('/api/deployments/') && c.url.endsWith('/history')) return jsonRes({ data: [] })
      if (c.url.startsWith('/api/deployments')) return jsonRes([RIG])
      if (c.url.startsWith('/api/transfers')) return jsonRes(transfers)
      if (c.url === '/api/hubs') return jsonRes({ data: HUBS })
      if (c.url === '/api/operators') return jsonRes({ data: PEOPLE })
      return jsonRes({ data: [] })
    }))
  })
  async function openDrawer() {
    render(<ToastProvider><AdminDeploymentsPage /></ToastProvider>)
    fireEvent.click(await screen.findByText('Owen Operator'))
    await screen.findByText('Sample bags')
  }
  async function openReturn(itemName: string) {
    const row = screen.getByText(itemName).closest('li') ?? screen.getByText(itemName).parentElement!.parentElement!
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Return item' }))
    return screen.findByRole('dialog', { name: 'Return Item' })
  }

  it('Return item waits for a hub, sends it, and the toast names it', async () => {
    await openDrawer()
    const dlg = await openReturn('Sample bags')
    expect(within(dlg).getByText('Pick a hub · came from YS Shop')).toBeInTheDocument()
    expect(within(dlg).getByRole('button', { name: 'Return' })).toBeDisabled()
    pick(within(dlg).getByRole('combobox', { name: /Return hub/ }), /Home Lab/)
    fireEvent.click(within(dlg).getByRole('button', { name: 'Return' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'DELETE')).toMatchObject({ url: '/api/deployments/rig-1/items/ki-bags', body: { hubId: 'hub1' } }))
    expect(await screen.findByText('Item returned to Home Lab.')).toBeInTheDocument()
  })

  it('Write off needs no hub and says "Item written off."', async () => {
    await openDrawer()
    const dlg = await openReturn('Sample bags')
    pick(within(dlg).getAllByRole('combobox')[0]!, 'Write off')
    expect(within(dlg).queryByRole('combobox', { name: /Return hub/ })).toBeNull()
    fireEvent.click(within(dlg).getByRole('button', { name: 'Return' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'DELETE')?.body).not.toHaveProperty('hubId'))
    expect(await screen.findByText('Item written off.')).toBeInTheDocument()
  })

  it('Reassign with an empty Reason posts note "" with force', async () => {
    await openDrawer()
    fireEvent.click(screen.getByRole('button', { name: /Reassign Primary…/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Reassign Primary Operator' })
    expect(within(dlg).getByLabelText('Reason (optional)')).toBeInTheDocument()
    pick(within(dlg).getByRole('combobox', { name: /Reassign to/ }), 'Xena Recipient')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Reassign Primary' }))
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/handoff'))?.body).toEqual(expect.objectContaining({ note: '', force: true })))
  })

  it('a pending transfer of 1 of 2 reads ×1 on the card and in the drawer', async () => {
    transfers = [{
      id: 't1', note: '', createdAt: '2026-10-23T12:00:00Z', status: 'PENDING',
      fromRig: { id: 'rig-1', operator: { id: 'op1', name: 'Owen Operator' } }, toOperator: { id: 'op2', name: 'Xena Recipient' },
      vehicles: [], items: [{ id: 'ti1', quantity: 1, kitItem: { id: 'ki-bags', quantity: 2, item: { id: 'i-bags', name: 'Sample bags' } } }],
    }]
    render(<ToastProvider><AdminDeploymentsPage /></ToastProvider>)
    expect(await screen.findByText('Sample bags ×1')).toBeInTheDocument()
    fireEvent.click(screen.getAllByText('Owen Operator')[0]!)
    await waitFor(() => expect(screen.getAllByText(/Sample bags ×1/)).toHaveLength(2))
    expect(screen.queryByText(/Sample bags ×2/)).toBeNull()
  })

  it('Remove vehicles: a transfer needs a person', async () => {
    await openDrawer()
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!) // the Rig section's (vehicles come first)
    const inDrawer = screen.getAllByText('Truck 1').map((t) => t.parentElement!).find((row) => within(row).queryByRole('checkbox'))!
    fireEvent.click(within(inDrawer).getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove (1)' }))
    const dlg = await screen.findByRole('dialog', { name: /Remove 1 Vehicle/ })
    pick(within(dlg).getByRole('combobox', { name: /Disposition/ }), 'Transfer to a person')
    expect(within(dlg).getByRole('button', { name: 'Confirm Remove' })).toBeDisabled()
    pick(within(dlg).getByRole('combobox', { name: /Person/ }), 'Xena Recipient')
    expect(within(dlg).getByRole('button', { name: 'Confirm Remove' })).toBeEnabled()
  })
})

// ─── 3.6 · Date-only values ─────────────────────────────────────────────────────────
describe('3.6 · date-only values show their own day', () => {
  it('formatDay / toDay', () => {
    expect(formatDay('2026-10-22T00:00:00.000Z')).toBe('Oct 22, 2026')
    expect(formatDay('2026-07-19')).toBe('Jul 19, 2026')
    expect(formatDay(null)).toBe('—')
    expect(toDay(undefined)).toBe('')
    expect(toDay(new Date('2026-10-22T00:00:00.000Z'))).toBe('2026-10-22')
  })

  describe('in Chicago, the evening before (UTC already tomorrow)', () => {
    const tz = process.env.TZ
    beforeEach(() => {
      process.env.TZ = 'America/Chicago'
      vi.useFakeTimers({ now: new Date('2026-10-23T01:00:00Z'), toFake: ['Date'] })
    })
    afterEach(() => { vi.useRealTimers() })
    afterAll(() => { process.env.TZ = tz; vi.useRealTimers() })

    it("the vehicle drawer's Insurance expires reads Oct 23, 2026 · 1d", async () => {
      const v = {
        id: 'v1', name: 'Truck 1', status: 'ACTIVE', type: 'TRUCK', year: 2022, odometer: 100, location: null, hubId: null, hubName: null,
        makeModel: null, vin: null, licensePlate: null, qrCodeId: 'qr-v1', assignedOperatorName: null, activeProjects: [],
        insuranceExpires: '2026-10-23T00:00:00.000Z', registrationExpires: null, notes: null, isRental: false, rentalCompany: null,
        rentalAgreementNumber: null, rentalAgreementUrl: null, rentalStartDate: null, rentalEndDate: null, rentalLocation: null,
        rentalReturnLocation: null, rentalCostAmount: null, rentalCostPeriod: null, rentalOneWay: false, _count: { dailyChecks: 0, maintenanceTasks: 0 },
      }
      vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/vehicles') return jsonRes({ data: [v] })
        if (url === '/api/vehicles/v1') return jsonRes({ data: { ...v, dailyChecks: [], maintenanceTasks: [], photos: [] } })
        return jsonRes({ data: [] })
      }))
      render(<ToastProvider><AdminVehiclesPage /></ToastProvider>)
      fireEvent.click(await screen.findByText('Truck 1'))
      await screen.findByRole('heading', { name: 'Truck 1' })
      const row = (await screen.findByText('Insurance expires')).parentElement!
      expect(within(row).getByText('Oct 23, 2026 · 1d')).toBeInTheDocument()
    })
  })
})

// ─── 3.7 · A crewmate's check ───────────────────────────────────────────────────────
describe("3.7 · the daily check knows a crewmate's check", () => {
  const VEHICLES = [
    { id: 'rv1', vehicle: { id: 'v1', name: 'Truck 1', type: 'TRUCK' } },
    { id: 'rv2', vehicle: { id: 'v2', name: 'Truck 2', type: 'TRUCK' } },
  ]
  const crewCheck = { vehicleId: 'v1', operatorId: 'op9', operatorName: 'Casey Crew', submittedAt: new Date().toISOString(), byMe: false }
  function stub(today: unknown) {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/deployments')) return jsonRes({ data: { id: 'rig1', vehicles: VEHICLES } })
      if (url.startsWith('/api/daily-check?')) return jsonRes({ data: [], total: 0, page: 1, pageSize: 100 })
      if (url.startsWith('/api/operator/today')) return jsonRes(today)
      if (url.startsWith('/api/checklist-templates')) return jsonRes({ items: [] })
      if (url.startsWith('/api/vehicles/')) {
        const v = VEHICLES.find((rv) => rv.vehicle.id === url.slice('/api/vehicles/'.length))?.vehicle
        return v ? jsonRes({ data: { ...v, odometer: 1000, lastCheckSite: null } }) : jsonRes({}, 404)
      }
      return jsonRes({})
    }))
  }
  const todayWith = (checks: unknown[]) => ({ data: { asOf: new Date().toISOString(), vehicleChecks: checks } })

  it('a crewmate checked Truck 1 → Truck 2 is preselected; Truck 1 is a disabled option saying who', async () => {
    stub(todayWith([crewCheck]))
    render(<ToastProvider><OperatorDailyCheckPage /></ToastProvider>)
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Vehicle/ })).toHaveTextContent('Truck 2'))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Vehicle/ }))
    const t1 = await screen.findByRole('option', { name: /Truck 1/ })
    expect(t1).toHaveAttribute('aria-disabled', 'true')
    expect(t1).toHaveTextContent(/Checked by Casey Crew at/)
  })

  it('?vehicleId=v1 shows the crew notice before any inspection row, and Next is disabled', async () => {
    window.history.replaceState(null, '', '/operator/daily-check?vehicleId=v1')
    stub(todayWith([crewCheck]))
    render(<ToastProvider><OperatorDailyCheckPage /></ToastProvider>)
    const notice = await screen.findByText(/Checked by Casey Crew at .+\. Only the person who filed a check can open or redo it\./)
    expect(notice.closest('.MuiAlert-standardWarning, .MuiAlert-colorWarning')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.queryByText(/You already filed a check/)).toBeNull()
  })

  it('a Today payload of {} changes nothing', async () => {
    stub({})
    render(<ToastProvider><OperatorDailyCheckPage /></ToastProvider>)
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Vehicle/ })).toHaveTextContent('Truck 1'))
    expect(screen.queryByText(/Checked by/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })
})
