import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// UXP-3: the operator Requests page, driven through the real page.
//  - 3c rider: the "handled" notification deep-links to ?tab=closed; the page seeds its
//    Active/Closed toggle from the URL after hydration (server snapshot stays ACTIVE).
//  - 3f (F-09): the composer opens in MATERIAL when the operator has an ACTIVE rig
//    (probed once on mount), else RESERVATION; a remembered last-used mode wins over both.

const { mutate, freshList } = vi.hoisted(() => ({
  mutate: vi.fn(),
  freshList: { data: undefined as unknown, isValidating: false, mutate: vi.fn(), updatedAt: null as number | null },
}))

vi.mock('@/hooks/useOfflineQueue', () => ({
  useOfflineQueue: () => ({ mutate, isOffline: false }),
}))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { userId: 'u1', name: 'Op One', role: 'OPERATOR', homeHubId: null } }),
}))
vi.mock('@/components/shared/useToast', () => ({ useToast: () => vi.fn() }))
vi.mock('@/hooks/useFreshList', () => ({ useFreshList: () => freshList }))

import RequestsPage from '@/app/(operator)/operator/requests/page'

const REQUESTS = [
  {
    id: 'q-active', status: 'REQUESTED', requestType: 'MATERIAL', label: 'Sample vials', neededBy: null,
    createdAt: '2026-09-01T00:00:00Z', lineCount: 1, decisionNote: null, projectName: null,
    fulfillerHubName: null, stockReservedAt: null, fulfillerOperatorId: null, requestedById: 'u1',
  },
  {
    id: 'q-closed', status: 'FULFILLED', requestType: 'MATERIAL', label: 'Drill bits', neededBy: null,
    createdAt: '2026-08-30T00:00:00Z', lineCount: 1, decisionNote: null, projectName: null,
    fulfillerHubName: null, stockReservedAt: null, fulfillerOperatorId: null, requestedById: 'u1',
  },
]

const jsonRes = (body: unknown) => Promise.resolve({ ok: true, json: async () => body } as Response)

/** The composer's data reads + the 3f rig probe. `activeRigs` is what ?active=true returns. */
function mockFetch(activeRigs: unknown = []) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/deployments?active=true')) return jsonRes(activeRigs)
    if (url.startsWith('/api/hubs')) return jsonRes({ data: [{ id: 'h1', name: 'Toledo Hub', city: 'Toledo', state: 'OH' }] })
    if (url.startsWith('/api/categories')) return jsonRes([])
    return jsonRes({ data: [] })
  })
}

beforeEach(() => {
  mutate.mockReset().mockResolvedValue({ ok: true, queued: false, data: {} })
  freshList.data = { data: REQUESTS }
  window.localStorage.clear()
  window.history.replaceState(null, '', '/operator/requests')
  vi.stubGlobal('fetch', mockFetch())
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/operator/requests')
})

describe('UXP-3 (3c rider): ?tab=closed lands on the Closed list', () => {
  it('defaults to Active without the param', async () => {
    render(<RequestsPage />)
    expect(await screen.findByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Sample vials')).toBeInTheDocument()
    expect(screen.queryByText('Drill bits')).toBeNull()
  })

  it('opens on Closed — showing the handled request — when the bell link carries ?tab=closed', async () => {
    window.history.replaceState(null, '', '/operator/requests?tab=closed')
    render(<RequestsPage />)
    expect(await screen.findByRole('button', { name: 'Closed' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Drill bits')).toBeInTheDocument()
    expect(screen.queryByText('Sample vials')).toBeNull()
  })

  it('an explicit toggle still wins over the URL', async () => {
    window.history.replaceState(null, '', '/operator/requests?tab=closed')
    render(<RequestsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Active' }))
    expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Sample vials')).toBeInTheDocument()
  })

  it('ignores a garbage ?tab value', async () => {
    window.history.replaceState(null, '', '/operator/requests?tab=bogus')
    render(<RequestsPage />)
    expect(await screen.findByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true')
  })
})

const ACTIVE_RIG = [{ id: 'rig-1', label: null, startedAt: '2026-09-01T00:00:00Z', vehicles: [], kits: [] }]

async function openComposer() {
  fireEvent.click((await screen.findAllByRole('button', { name: 'New Request' }))[0])
  await screen.findByRole('heading', { name: 'New Request' })
}

describe('UXP-3 (3f): the composer opens in the common case', () => {
  it('opens in MATERIAL when the operator has an active rig', async () => {
    vi.stubGlobal('fetch', mockFetch(ACTIVE_RIG))
    render(<RequestsPage />)
    // The probe settles on mount, before the tap.
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/deployments?active=true'))
    await openComposer()
    expect(screen.getByRole('button', { name: 'Request materials' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Notes (optional)')).toBeInTheDocument()
  })

  it('opens in RESERVATION when there is no active rig', async () => {
    render(<RequestsPage />)
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/deployments?active=true'))
    await openComposer()
    expect(screen.getByRole('button', { name: 'Reserve a rig' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('falls back to RESERVATION when the probe fails (offline)', async () => {
    const base = mockFetch()
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) =>
      String(input).startsWith('/api/deployments?active=true') ? Promise.reject(new Error('offline')) : base(input)))
    render(<RequestsPage />)
    await openComposer()
    expect(screen.getByRole('button', { name: 'Reserve a rig' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('a remembered last-used RESERVATION beats the active-rig heuristic', async () => {
    window.localStorage.setItem('ahits_request_mode', 'RESERVATION')
    vi.stubGlobal('fetch', mockFetch(ACTIVE_RIG))
    render(<RequestsPage />)
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/deployments?active=true'))
    await openComposer()
    expect(screen.getByRole('button', { name: 'Reserve a rig' })).toHaveAttribute('aria-pressed', 'true')
  })
})
