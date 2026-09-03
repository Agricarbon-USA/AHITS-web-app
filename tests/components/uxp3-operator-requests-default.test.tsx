import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// UXP-3: the operator Requests page, driven through the real page.
//  - 3c rider: the "handled" notification deep-links to ?tab=closed; the page seeds its
//    Active/Closed toggle from the URL after hydration (server snapshot stays ACTIVE).

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

beforeEach(() => {
  mutate.mockReset().mockResolvedValue({ ok: true, queued: false, data: {} })
  freshList.data = { data: REQUESTS }
  window.history.replaceState(null, '', '/operator/requests')
  vi.stubGlobal('fetch', vi.fn(() => jsonRes({ data: [] })))
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
