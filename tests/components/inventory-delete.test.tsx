import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider } from '@/components/shared/useToast'

// PR-3c (D-o · D-p · D-r · D-s): delete items, with Undo, bulk delete, and
// "Show deleted → Restore", driven through the real inventory page (the harness of
// uxp6-item-form.test.tsx). Plus the scan page showing a deleted sticker's 410 message.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/inventory',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/hooks/useHistoryGuard', () => ({ useHistoryGuard: () => {} }))
vi.mock('@/hooks/useOfflineQueue', () => ({ useOfflineQueue: () => ({ mutate: vi.fn(), isOffline: false }) }))
vi.mock('@/components/shared/PhotoCapture', () => ({ PhotoCapture: () => null }))
// The scanner dialog shows `result.message` for an error result — the mock does the same.
vi.mock('@/components/shared/QrScannerDialog', async () => {
  const React = await import('react')
  return {
    QrScannerDialog: ({ open, onResolve }: { open: boolean; onResolve: (c: string) => Promise<{ status: string; message?: string }> }) => {
      const [msg, setMsg] = React.useState('')
      return open
        ? React.createElement('div', null,
            React.createElement('button', { onClick: async () => { const r = await onResolve('DEL-QR'); setMsg(r.message ?? r.status) } }, 'fake scan'),
            React.createElement('p', null, msg))
        : null
    },
  }
})

import AdminInventoryPage from '@/app/(admin)/admin/inventory/page'
import OperatorScanPage from '@/app/(operator)/operator/scan/page'

const UNIT_COUNTS = { totalUnits: 0, available: 0, checkedOut: 0, inMaintenance: 0, inoperable: 0, inTransit: 0, retired: 0 }
const counts = (n: number) => ({ owned: n, onHand: n, available: n, reserved: 0, out: 0, inMaintenance: 0, inoperable: 0, inTransit: 0, retired: 0 })

const row = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, category: { id: 'c1', name: 'Sampling' }, hub: null, sku: null, quantity: 0, unitCost: null,
  reorderUrl: null, supplier: null, location: null, qrCodeId: `qr-${id}`, notes: null, lowStockThreshold: null,
  itemType: 'SERIALIZED', status: 'AVAILABLE', unitId: null, expectedQuantity: null,
  createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z',
  currentOperator: null, currentProject: null, activeProjects: [], unitCounts: UNIT_COUNTS, units: [],
  derivedQuantity: 3, availableQuantity: 3, itemCounts: counts(3), ...extra,
})

const GPS = row('i-gps', 'GPS rover')
const TAPE = row('i-tape', 'Tape measure')
const CORER = row('i-corer', 'Corer')
const FACTS = {
  itemType: 'SERIALIZED',
  references: {},
  units: { AVAILABLE: 2, INOPERABLE: 1 },
  stock: { onHand: 0, hubs: 0 },
  history: { deployments: 3, checkLogs: 12, repairs: 1, photos: 2 },
}
// Noon UTC on 9 Oct — the same calendar day in Chicago, whatever the runner's zone.
const DELETED = row('i-old', 'Old sampler', { deletedAt: '2026-10-09T17:00:00Z', deletedBy: { id: 'u1', name: 'Max' } })

type Call = { method: string; url: string; body: Record<string, unknown> | null }
let calls: Call[] = []
let listRows: unknown[] = []
let deleteResponse: { status: number; body: unknown } = { status: 200, body: { ok: true, deletedAt: '2026-10-09T17:00:00Z' } }
let bulkResults: unknown[] = []

const jsonRes = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body } as Response)

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null })
    if (method === 'DELETE') return jsonRes(deleteResponse.body, deleteResponse.status)
    if (method === 'POST' && url.endsWith('/restore')) return jsonRes({ ok: true })
    if (method === 'POST' && url === '/api/inventory/bulk-delete') return jsonRes({ results: bulkResults })
    if (url.startsWith('/api/inventory?')) {
      return jsonRes(url.includes('deleted=1') ? { data: [DELETED], total: 1 } : { data: listRows, total: listRows.length })
    }
    if (url.endsWith('/references')) return jsonRes({ data: FACTS })
    if (url === '/api/inventory/categories') return jsonRes({ data: [{ id: 'c1', name: 'Sampling' }] })
    if (url === '/api/inventory/hubs') return jsonRes({ data: [] })
    return jsonRes({ data: [] })
  }))
}

beforeEach(() => {
  calls = []
  listRows = [GPS, TAPE, CORER]
  deleteResponse = { status: 200, body: { ok: true, deletedAt: '2026-10-09T17:00:00Z' } }
  bulkResults = []
  stubFetch()
})
afterEach(() => { vi.unstubAllGlobals() })

async function renderPage() {
  render(<ToastProvider><AdminInventoryPage /></ToastProvider>)
  await screen.findByText('GPS rover')
}

const rowOf = (name: string) => screen.getByText(name).closest('tr')!
const writes = (method: string, url: string) => calls.filter((c) => c.method === method && c.url === url)

describe('Delete — the dialog, Undo and refusals (D-o · D-s)', () => {
  it('states the rule, lists what goes with it and the kept history, then DELETEs on confirm', async () => {
    await renderPage()
    fireEvent.click(within(rowOf('GPS rover')).getByRole('button', { name: 'Delete' }))
    const dlg = await screen.findByRole('dialog', { name: 'Delete item?' })
    expect(dlg).toHaveTextContent('Delete "GPS rover"? Use this for mistakes, duplicates and test entries. To retire real gear use Retire instead — it stays in history and reports.')
    expect(await within(dlg).findByText('3 units (2 available, 1 inoperable) go with it; their QR labels stay bound.')).toBeInTheDocument()
    expect(within(dlg).getByText('History kept, hidden: 3 deployments · 12 check-log entries · 1 repair · 2 photos.')).toBeInTheDocument()
    expect(within(dlg).getByText('Restorable under Show deleted.')).toBeInTheDocument()

    fireEvent.click(within(dlg).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(writes('DELETE', '/api/inventory/i-gps')).toHaveLength(1))
    expect(await screen.findByText('GPS rover deleted')).toBeInTheDocument()
  })

  it('Undo on the toast posts restore', async () => {
    await renderPage()
    fireEvent.click(within(rowOf('GPS rover')).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Delete item?' })).getByRole('button', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(writes('POST', '/api/inventory/i-gps/restore')).toHaveLength(1))
    expect(await screen.findByText('GPS rover restored')).toBeInTheDocument()
  })

  it('a 409 is toasted verbatim', async () => {
    deleteResponse = { status: 409, body: { error: '2 open repairs — close them first.' } }
    await renderPage()
    fireEvent.click(within(rowOf('GPS rover')).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Delete item?' })).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('2 open repairs — close them first.')).toBeInTheDocument()
  })

  it('deleting the item pinned under "Just added" clears the pin', async () => {
    await renderPage()
    // Create an item → it is pinned under "Just added".
    listRows = [GPS, TAPE, CORER]
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null })
      if (method === 'POST' && url === '/api/inventory') return jsonRes({ data: { id: 'i-new', name: 'Test entry', itemType: 'CONSUMABLE' } }, 201)
      if (url === '/api/inventory/i-new') return jsonRes({ data: { ...row('i-new', 'Test entry'), checkLogs: [], photos: [] } })
      if (method === 'DELETE') return jsonRes({ ok: true, deletedAt: '2026-10-09T17:00:00Z' })
      if (url.startsWith('/api/inventory?')) return jsonRes({ data: listRows, total: listRows.length })
      if (url.endsWith('/references')) return jsonRes({ data: FACTS })
      if (url === '/api/inventory/categories') return jsonRes({ data: [{ id: 'c1', name: 'Sampling' }] })
      return jsonRes({ data: [] })
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }))
    await screen.findByRole('dialog', { name: 'Add item' })
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Test entry' } })
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Category/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'Sampling' }))
    // Quantity 0: a consumable with stock needs a hub (T5) — not what this test is about.
    fireEvent.change(screen.getByLabelText(/Initial Quantity/), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    expect(await screen.findByText('Just added')).toBeInTheDocument()

    fireEvent.click(within(screen.getByText('Test entry').closest('tr')!).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Delete item?' })).getByRole('button', { name: 'Delete' }))
    await screen.findByText('Test entry deleted')
    expect(screen.queryByText('Just added')).toBeNull()
  })
})

describe('Show deleted → Restore (D-o · D-q)', () => {
  it('fetches deleted=1; rows carry "Deleted 9 Oct · Max" and only a Restore action', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show deleted' }))
    expect(await screen.findByText('Old sampler')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'GET' && c.url.startsWith('/api/inventory?') && c.url.includes('deleted=1'))).toBe(true)
    const r = rowOf('Old sampler')
    expect(within(r).getByText('Deleted 9 Oct · Max')).toBeInTheDocument()
    expect(within(r).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Restore'])
    expect(screen.queryByRole('checkbox', { name: /^Select/ })).toBeNull()

    fireEvent.click(within(r).getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(writes('POST', '/api/inventory/i-old/restore')).toHaveLength(1))
    expect(await screen.findByText('Old sampler restored')).toBeInTheDocument()
  })
})

describe('Delete selected (D-p)', () => {
  it('three selected, one refused → "2 deleted · 1 refused", the refusal listed, its row still selected', async () => {
    bulkResults = [
      { id: 'i-gps', name: 'GPS rover', ok: true },
      { id: 'i-tape', name: 'Tape measure', ok: false, error: 'Named on 1 open request — edit or cancel it first.' },
      { id: 'i-corer', name: 'Corer', ok: true },
    ]
    await renderPage()
    expect(screen.getByRole('checkbox', { name: 'Select all 3 on this page' })).toBeInTheDocument()
    for (const n of ['GPS rover', 'Tape measure', 'Corer']) fireEvent.click(screen.getByRole('checkbox', { name: `Select ${n}` }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete selected' }))
    const dlg = await screen.findByRole('dialog', { name: 'Delete selected?' })
    expect(dlg).toHaveTextContent('Delete 3 items? GPS rover, Tape measure, Corer.')
    expect(dlg).toHaveTextContent('Anything still in use is refused and stays.')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(writes('POST', '/api/inventory/bulk-delete')).toHaveLength(1))
    expect(writes('POST', '/api/inventory/bulk-delete')[0].body).toEqual({ ids: ['i-gps', 'i-tape', 'i-corer'] })
    expect(await screen.findByText('2 deleted · 1 refused')).toBeInTheDocument()
    // The list reloads after the delete; the refused row comes back still selected.
    expect(await screen.findByRole('checkbox', { name: 'Select Tape measure' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select GPS rover' })).not.toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    const list = await screen.findByRole('dialog', { name: 'Not deleted' })
    expect(within(list).getByText('Tape measure')).toBeInTheDocument()
    expect(within(list).getByText('Named on 1 open request — edit or cancel it first.')).toBeInTheDocument()
  })
})

describe('scan: a deleted unit\'s sticker says so (D-r)', () => {
  it('renders the 410 message, not "not found"', async () => {
    const msg = 'GPS rover (serial A-7) was deleted from inventory — an admin can restore it under Show deleted.'
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/inventory/units/by-qr/')) return jsonRes({ error: msg }, 410)
      if (url.startsWith('/api/vehicles/by-qr/')) return jsonRes({ error: 'nf' }, 404)
      return jsonRes([])
    }))
    render(<ToastProvider><OperatorScanPage /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: /scan/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'fake scan' }))
    expect(await screen.findByText(msg)).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).startsWith('/api/vehicles/by-qr/'))).toBe(false)
  })
})
