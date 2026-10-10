import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider } from '@/components/shared/useToast'

// PR-1a (B2 residuals): the Inventory page on the paged table.
//
//  - the list says how much it is showing of how much there is ("Showing 1–100
//    of 160") — it used to fetch 25 rows, regroup them under category headers and
//    show them with no count and no pager, so the catalog looked like 25 items;
//  - a newly created item is PINNED at the top under "Just added" with a New
//    chip. A new item sorts wherever its name falls; past the page cut it simply
//    did not appear, which reads as "the save did not work" (U-12). The pinned
//    row is re-read from `GET /api/inventory/<id>` because the POST returns a raw
//    row with no counts (and a serialized item's units are created after it);
//  - the pin is a one-shot: searching, filtering or paging clears it, and the row
//    is never shown twice;
//  - **Show retired** is the door to retired items (D-a, list half) — the list
//    excludes them by default;
//  - the row **Retire** action was HIDDEN here while retiring an item wrote a flag
//    nothing read (B1/U-1); PR-3b made retire real and turned it back on (the flow
//    is tested in pr3b-guards.test.tsx).

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/admin/inventory',
  useSearchParams: () => new URLSearchParams(),
}))

import AdminInventoryPage from '@/app/(admin)/admin/inventory/page'

const CATEGORIES = [{ id: 'c1', name: 'Sampling' }]
const HUBS = [{ id: 'h1', name: 'Toledo Hub', city: 'Toledo', state: 'OH' }]
const UNIT_COUNTS = { totalUnits: 0, available: 0, checkedOut: 0, inMaintenance: 0, inoperable: 0, inTransit: 0, retired: 0 }
// PR-2: every inventory payload carries the server's itemCounts.
const itemCountsOf = (n: number) => ({ owned: n, onHand: n, available: n, reserved: 0, out: 0, inMaintenance: 0, inoperable: 0, inTransit: 0, retired: 0 })

const row = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, category: CATEGORIES[0], hub: HUBS[0], sku: null, quantity: 4, unitCost: null,
  reorderUrl: null, supplier: null, location: null, qrCodeId: `qr-${id}`, notes: null,
  lowStockThreshold: null, itemType: 'CONSUMABLE', unitId: null, expectedQuantity: null,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  currentOperator: null, currentProject: null, activeProjects: [], unitCounts: UNIT_COUNTS,
  units: [], derivedQuantity: 4, availableQuantity: 4, itemCounts: itemCountsOf(4), checkLogs: [], photos: [], ...extra,
})

const jsonRes = (body: unknown, ok = true, status = ok ? 200 : 400) =>
  Promise.resolve({ ok, status, json: async () => body } as Response)

let listRows: unknown[] = []
let listTotal = 0
const listUrls: string[] = []

function mockFetch() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (method === 'POST' && url === '/api/inventory') {
      const b = JSON.parse(String(init?.body))
      return jsonRes({ data: { id: 'i-new', name: b.name, itemType: b.itemType } }, true, 201)
    }
    if (method !== 'GET') return jsonRes({ data: {} })
    if (url.startsWith('/api/inventory?')) {
      listUrls.push(url)
      return jsonRes({ data: listRows, total: listTotal, page: 1, pageSize: 100, truncated: false })
    }
    if (url === '/api/inventory/categories') return jsonRes({ data: CATEGORIES })
    if (url === '/api/inventory/hubs') return jsonRes({ data: HUBS })
    if (url === '/api/inventory/i-new') return jsonRes({ data: row('i-new', 'Tedlar bag') })
    if (url === '/api/users') return jsonRes({ data: [] })
    if (url === '/api/projects') return jsonRes({ data: [] })
    return jsonRes({ data: [] })
  })
}

beforeEach(() => {
  replace.mockClear()
  window.history.replaceState({}, '', '/admin/inventory')
  listUrls.length = 0
  listRows = [row('i-1', 'Manual Corer')]
  listTotal = 160
  vi.stubGlobal('fetch', mockFetch())
})
afterEach(() => { vi.unstubAllGlobals() })

async function renderPage() {
  render(<ToastProvider><AdminInventoryPage /></ToastProvider>)
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/inventory/hubs'))
  await screen.findByText('Manual Corer')
}

async function addItem(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Add Item' }))
  const dlg = await screen.findByRole('dialog', { name: 'Add item' })
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: name } })
  // Category is required; quantity 0 keeps the hub optional (T5) so this test
  // stays about the pin, not about the form's own rules.
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /Category/ }))
  fireEvent.click(await screen.findByRole('option', { name: 'Sampling' }))
  fireEvent.change(screen.getByLabelText(/^Initial Quantity/), { target: { value: '0' } })
  fireEvent.click(within(dlg).getByRole('button', { name: 'Add item' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add item' })).toBeNull())
}

const lastListUrl = () => listUrls[listUrls.length - 1]!

describe('PR-1a · Inventory list truth', () => {
  it('reads one page of 100 and captions it against the server total', async () => {
    await renderPage()
    expect(lastListUrl()).toContain('pageSize=100')
    expect(lastListUrl()).toContain('page=1')
    expect(screen.getByText('Showing 1–100 of 160 items')).toBeInTheDocument()
  })

  it('excludes retired items until "Show retired" is on, then asks the server for them', async () => {
    await renderPage()
    expect(lastListUrl()).not.toContain('includeRetired')
    fireEvent.click(screen.getByRole('checkbox', { name: /Show retired/i }))
    await waitFor(() => expect(lastListUrl()).toContain('includeRetired=1'))
  })

  it('pins the item just created under "Just added" with a New chip', async () => {
    await renderPage()
    await addItem('Tedlar bag')
    await waitFor(() => expect(screen.getByText('Just added')).toBeInTheDocument())
    expect(await screen.findByText('Tedlar bag')).toBeInTheDocument()
    expect(screen.getByText('New')).toBeInTheDocument()
    // Re-read with counts rather than trusting the create response's raw row.
    expect(fetch).toHaveBeenCalledWith('/api/inventory/i-new')
  })

  it('never shows the pinned row twice once the list catches up', async () => {
    await renderPage()
    listRows = [row('i-1', 'Manual Corer'), row('i-new', 'Tedlar bag')]
    await addItem('Tedlar bag')
    await waitFor(() => expect(screen.getByText('Just added')).toBeInTheDocument())
    await waitFor(() => expect(screen.getAllByText('Tedlar bag')).toHaveLength(1))
  })

  it('clears the pin on the next search — it does not sit atop a list it is not in', async () => {
    await renderPage()
    await addItem('Tedlar bag')
    await waitFor(() => expect(screen.getByText('Just added')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText('Search items…'), { target: { value: 'corer' } })
    await waitFor(() => expect(lastListUrl()).toContain('q=corer'), { timeout: 2000 })
    await waitFor(() => expect(screen.queryByText('Just added')).not.toBeInTheDocument())
  })

  it('changes a URL-backed filter with exactly ONE history replace, even from a deep page', async () => {
    // The regression guard for a bug PR-1a introduced and this test now pins.
    // `setFilters` issues a `router.replace` built from `searchParams` + the
    // patch; a second `setPage(0)` issued the same tick builds ITS replace from a
    // `window.location` Next has not committed yet. The second lands last,
    // carrying the OLD filters — so picking a category silently did nothing and
    // the list came back unfiltered. Starting at `?page=3` is what makes the
    // second replace differ from the current URL and therefore actually fire, so
    // this is the case that reproduces it.
    window.history.replaceState({}, '', '/admin/inventory?page=3')
    await renderPage()
    expect(lastListUrl()).toContain('page=3')

    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Category/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'Sampling' }))

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1))
    const [url] = replace.mock.calls[0]!
    expect(String(url)).toContain('categoryId=c1')
    expect(String(url)).not.toContain('page=')
    // (The refetch under the new filter is not assertable here: this harness
    // mocks `useSearchParams` statically, so `useUrlFilters` — for which the URL
    // is the source of truth — never sees the patch. The replace is the only
    // observable, and it is the one that was wrong.)
  })

  it('offers row-level Retire again now that retiring an item is real (PR-3b) — Edit stays', async () => {
    // PR-6 (D-w): Retire is for serialized gear, so the row here is a serialized one.
    listRows = [row('i-1', 'Manual Corer', { itemType: 'SERIALIZED' })]
    await renderPage()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retire' })).toBeInTheDocument()
  })
})
