import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider } from '@/components/shared/useToast'
import { StatusChip } from '@/components/shared/StatusChip'

// PR-2 (B3 / C-6 / C-7 / C-10): the Inventory page renders the server's
// `itemCounts` and never recounts.
//
// The fixture deliberately gives every LEGACY field a different, wrong number
// (stored `quantity`, `derivedQuantity`, `availableQuantity`, `unitCounts`), so
// a screen still reading any of them shows the wrong figure and fails here.
// Manual Corer is the acceptance case: 11 available · 0 out · 14 owned, one
// retired, one "Returning".

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/inventory',
  useSearchParams: () => new URLSearchParams(),
}))

import AdminInventoryPage from '@/app/(admin)/admin/inventory/page'

const CATEGORIES = [{ id: 'c1', name: 'Sampling' }]
const HUBS = [{ id: 'h1', name: 'Toledo Hub', city: 'Toledo', state: 'OH' }]

const CORER = {
  id: 'i-corer', name: 'Manual Corer', category: CATEGORIES[0], hub: HUBS[0], sku: null,
  quantity: 99, unitCost: null, reorderUrl: null, supplier: null, location: null, qrCodeId: 'qr-corer',
  notes: null, lowStockThreshold: null, itemType: 'SERIALIZED', unitId: null, expectedQuantity: null,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  currentOperator: null, currentProject: null, activeProjects: [], units: [],
  // Legacy fields — all wrong on purpose.
  derivedQuantity: 98, availableQuantity: 97,
  unitCounts: { totalUnits: 15, available: 96, checkedOut: 95, inMaintenance: 0, inoperable: 0, inTransit: 0, retired: 0 },
  // The truth.
  itemCounts: { owned: 14, onHand: 14, available: 11, reserved: 0, out: 0, inMaintenance: 1, inoperable: 1, inTransit: 1, retired: 1 },
  checkLogs: [], photos: [],
}

const jsonRes = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)

beforeEach(() => {
  window.history.replaceState({}, '', '/admin/inventory')
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/inventory?')) return jsonRes({ data: [CORER], total: 1, page: 1, pageSize: 100, truncated: false })
    if (url === '/api/inventory/i-corer') return jsonRes({ data: CORER })
    if (url === '/api/inventory/categories') return jsonRes({ data: CATEGORIES })
    if (url === '/api/inventory/hubs') return jsonRes({ data: HUBS })
    return jsonRes({ data: [] })
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

async function renderPage() {
  render(<ToastProvider><AdminInventoryPage /></ToastProvider>)
  await screen.findByText('Manual Corer')
}

describe('PR-2 · the inventory page reads itemCounts', () => {
  it('list row: Available · Out · Total = 11 · 0 · 14', async () => {
    await renderPage()
    const row = screen.getByText('Manual Corer').closest('tr')!
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent)
    // Available, Out, Total are the three cells after the select checkbox (PR-3c) and
    // name / category / hub.
    expect(cells.slice(4, 7)).toEqual(['11', '0', '14'])
  })

  it('drawer: "14 owned · 1 retired", a Returning chip, and the Units tab names the retired', async () => {
    await renderPage()
    fireEvent.click(screen.getByText('Manual Corer'))
    expect(await screen.findByText('14 owned · 1 retired')).toBeInTheDocument()
    expect(screen.getByText('1 Returning')).toBeInTheDocument()
    expect(screen.getByText('11 Available')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Units (15 · 1 retired)' })).toBeInTheDocument()
    expect(screen.queryByText(/Checked Out/)).toBeNull()
  })

  it('edit form: the count is owned (14), not the stored quantity', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const dlg = await screen.findByRole('dialog', { name: 'Edit item' })
    await waitFor(() => expect(within(dlg).getByText('14 (managed in Units tab)')).toBeInTheDocument())
  })
})

describe('PR-2 · IN_TRANSIT is "Returning" (C-6/U-3)', () => {
  it('renders a Returning chip, never the raw enum', () => {
    render(<StatusChip status="IN_TRANSIT" kind="equipment" />)
    expect(screen.getByText('Returning')).toBeInTheDocument()
    expect(screen.queryByText('IN_TRANSIT')).toBeNull()
  })
})
