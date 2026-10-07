import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider } from '@/components/shared/useToast'

// PR-1a (L-1 / C-1 / U-4 / P-11): the Maintenance page was the worst case of the
// "lists pretend to be complete" habit —
//
//  - it fetched `/api/maintenance` bare: the first 25 tasks, ordered so scheduled
//    "upcoming" items came first, then re-filtered THAT page under the tabs. Past
//    25 tasks the Damage and Overdue tabs silently lost rows;
//  - the tab badges counted the page, so they disagreed with the dashboard card;
//  - an alert's "View" link searched the loaded page for its task id and, not
//    finding it, did nothing at all.
//
// Now the tab is a server filter, the badges are the server's facet counts over
// the same `where` as the rows, and the `?task=` deep-link is a fetch by id.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/maintenance',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/hooks/useHistoryGuard', () => ({ useHistoryGuard: () => {} }))

import AdminMaintenancePage from '@/app/(admin)/admin/maintenance/page'

const task = (id: string, over: Record<string, unknown> = {}) => ({
  id, taskName: `Repair ${id}`, status: 'IN_PROGRESS', priority: 'HIGH', isDamageReport: true,
  repairType: null, resolutionPath: null, intervalType: 'DAYS', intervalValue: 30,
  nextDue: null, nextOdometer: null, completedAt: null, dateDelivered: null,
  shopName: null, shopAddress: null, purchaseOrder: null, invoiceNumber: null,
  locationNote: null, estimatedCost: null, actualCost: null, notes: null,
  createdAt: '2026-10-01T00:00:00Z', vehicle: { id: 'v1', name: 'Truck 1' }, item: null,
  unit: null, repairHub: null, hub: null, photos: [], rig: null, reportedBy: null, ...over,
})

const jsonRes = (body: unknown, ok = true, status = ok ? 200 : 404) =>
  Promise.resolve({ ok, status, json: async () => body } as Response)

let rows: unknown[] = []
let total = 0
let facets = { damage: 0, overdue: 0, active: 0, completed: 0 }
let deepLinkTask: unknown | null = null
const listUrls: string[] = []

function mockFetch() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if ((init?.method ?? 'GET') !== 'GET') return jsonRes({ data: {} })
    if (url.startsWith('/api/maintenance?')) {
      listUrls.push(url)
      return jsonRes({ data: rows, total, page: 1, pageSize: 100, truncated: false, facets })
    }
    if (/^\/api\/maintenance\/[^/?]+$/.test(url)) {
      return deepLinkTask ? jsonRes({ data: deepLinkTask }) : jsonRes({ error: 'Task not found' }, false, 404)
    }
    if (url === '/api/vehicles') return jsonRes({ data: [] })
    if (url.startsWith('/api/hubs')) return jsonRes([])
    if (url.startsWith('/api/deployments')) return jsonRes([])
    if (url.startsWith('/api/status-links')) return jsonRes({ data: [] })
    return jsonRes({ data: [] })
  })
}

beforeEach(() => {
  listUrls.length = 0
  rows = [task('t1')]
  total = 1
  facets = { damage: 0, overdue: 0, active: 0, completed: 0 }
  deepLinkTask = null
  window.history.replaceState({}, '', '/admin/maintenance')
  vi.stubGlobal('fetch', mockFetch())
})
afterEach(() => { vi.unstubAllGlobals() })

const renderPage = async () => {
  render(<ToastProvider><AdminMaintenancePage /></ToastProvider>)
  await waitFor(() => expect(listUrls.length).toBeGreaterThan(0))
}
const lastListUrl = () => listUrls[listUrls.length - 1]!

describe('PR-1a · Maintenance tabs are server-side', () => {
  it('asks the server for the damage tab on mount — one page of 100, not of 25', async () => {
    await renderPage()
    expect(lastListUrl()).toContain('tab=damage')
    expect(lastListUrl()).toContain('pageSize=100')
    expect(lastListUrl()).toContain('page=1')
  })

  it('refetches with the new tab when the tab changes, and goes back to page 1', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('tab', { name: /Overdue/ }))
    await waitFor(() => expect(lastListUrl()).toContain('tab=overdue'))
    expect(lastListUrl()).toContain('page=1')
  })

  it('badges the tabs from the server facets — 40 tasks, 12 open damage reports', async () => {
    facets = { damage: 12, overdue: 3, active: 1, completed: 24 }
    total = 12
    await renderPage()
    await waitFor(() => expect(screen.getByRole('tab', { name: /Damage reports/ })).toHaveTextContent('12'))
    expect(screen.getByRole('tab', { name: /Overdue/ })).toHaveTextContent('3')
    expect(screen.getByRole('tab', { name: /In progress/ })).toHaveTextContent('(1)')
    expect(screen.getByRole('tab', { name: /Completed/ })).toHaveTextContent('(24)')
  })

  it('captions the rows against the server total, not the rows it holds', async () => {
    rows = [task('t1')]
    total = 40
    await renderPage()
    expect(await screen.findByText('Showing 1–40 of 40 repairs')).toBeInTheDocument()
  })

  it('a ?task= deep-link opens that task by id, whatever page it lives on', async () => {
    // Deliberately NOT in `rows` — the old code searched the loaded page and,
    // finding nothing, did nothing.
    deepLinkTask = task('t-999', { taskName: 'Cracked auger flight' })
    window.history.replaceState({}, '', '/admin/maintenance?task=t-999')
    await renderPage()
    expect(await screen.findByText('Cracked auger flight')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/maintenance/t-999')
  })

  it('says so when the deep-linked repair is closed or gone, instead of silently doing nothing', async () => {
    deepLinkTask = null
    window.history.replaceState({}, '', '/admin/maintenance?task=t-gone')
    await renderPage()
    expect(await screen.findByText('That repair is closed or no longer exists.')).toBeInTheDocument()
  })
})
