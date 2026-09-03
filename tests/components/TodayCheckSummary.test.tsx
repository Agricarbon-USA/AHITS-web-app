import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// UXP-3 (F-08): the "Done" chip on Today opens today's check for that vehicle (the
// CC-26 read-only contents) + a Redo action. Mocks mirror DailyCheckViewer.test.tsx:
// the gallery (photo-security URL signing) and next/navigation (DailyCheckViewer.tsx
// imports useRouter for the admin dialog we deliberately do not reuse).
vi.mock('@/components/shared/PhotoGallery', () => ({
  PhotoGallery: ({ photos }: { photos: unknown[] }) => <div data-testid="gallery">{photos.length} photos</div>,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/operator/dashboard',
}))

import { TodayCheckSummary, NO_CHECK_TODAY, CHECK_LOAD_ERROR, REDO_LABEL } from '@/components/operator/today/TodayCheckSummary'
import type { ViewerCheck } from '@/components/admin/DailyCheckViewer'
import { businessDate } from '@/lib/business-date'

const check: ViewerCheck = {
  id: 'c1',
  date: '2026-09-03',
  submittedAt: '2026-09-03T13:00:00Z',
  passFail: false,
  odometer: 48210,
  site: 'North field',
  issues: 'Left brake light is out',
  durationMs: 95000,
  checklistJson: [
    { key: 'tires', label: 'Tires OK', value: 'yes' },
    { key: 'lights', label: 'Lights working', value: 'no', note: 'left brake light out' },
  ],
  operator: { id: 'o1', name: 'Dana Ruiz' },
  vehicle: { id: 'v1', name: 'Truck-01', type: 'TRUCK' },
  photos: [],
}

type Route = { ok: boolean; status: number; body: unknown }
let routes: Record<string, Route>
const fetchMock = vi.fn(async (url: string) => {
  const r = routes[url]
  if (!r) throw new Error(`unexpected fetch ${url}`)
  return { ok: r.ok, status: r.status, json: async () => r.body } as unknown as Response
})

const LIST_URL = `/api/daily-check?vehicleId=v1&date=${businessDate()}&pageSize=1`

beforeEach(() => {
  routes = {}
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  window.history.replaceState(null, '', '/operator/dashboard')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TodayCheckSummary (UXP-3 F-08)', () => {
  it('lists today\'s check for the vehicle, loads it by id, and renders the answers', async () => {
    routes[LIST_URL] = { ok: true, status: 200, body: { data: [{ id: 'c1' }], total: 1, page: 1, pageSize: 1 } }
    routes['/api/daily-check/c1'] = { ok: true, status: 200, body: { data: check } }
    render(<TodayCheckSummary vehicleId="v1" open onClose={vi.fn()} onRedo={vi.fn()} />)

    expect(screen.getByText('Daily check')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Lights working')).toBeInTheDocument())
    expect(screen.getByText('Tires OK')).toBeInTheDocument()
    expect(screen.getByText('left brake light out')).toBeInTheDocument() // failed-item note surfaced
    expect(screen.getByText('48,210 mi')).toBeInTheDocument()
    expect(screen.getByText('Fail')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(LIST_URL)
    expect(fetchMock).toHaveBeenCalledWith('/api/daily-check/c1')
  })

  it('shows "No check found for today." when the list is empty', async () => {
    routes[LIST_URL] = { ok: true, status: 200, body: { data: [], total: 0, page: 1, pageSize: 1 } }
    render(<TodayCheckSummary vehicleId="v1" open onClose={vi.fn()} onRedo={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(NO_CHECK_TODAY)).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(1) // no detail fetch without an id
  })

  it('shows the connection message when the read fails', async () => {
    routes[LIST_URL] = { ok: false, status: 500, body: { error: 'boom' } }
    render(<TodayCheckSummary vehicleId="v1" open onClose={vi.fn()} onRedo={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(CHECK_LOAD_ERROR)).toBeInTheDocument())
  })

  it('"Redo check (replaces today\'s)" hands the vehicle id to onRedo', async () => {
    routes[LIST_URL] = { ok: true, status: 200, body: { data: [{ id: 'c1' }], total: 1, page: 1, pageSize: 1 } }
    routes['/api/daily-check/c1'] = { ok: true, status: 200, body: { data: check } }
    const onRedo = vi.fn()
    render(<TodayCheckSummary vehicleId="v1" open onClose={vi.fn()} onRedo={onRedo} />)
    const redo = await screen.findByRole('button', { name: REDO_LABEL })
    await waitFor(() => expect(redo).toBeEnabled())
    fireEvent.click(redo)
    expect(onRedo).toHaveBeenCalledWith('v1')
  })

  it('renders nothing and fetches nothing while closed', () => {
    render(<TodayCheckSummary vehicleId={null} open={false} onClose={vi.fn()} onRedo={vi.fn()} />)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText('Daily check')).toBeNull()
  })

  it('the Close X calls onClose', async () => {
    routes[LIST_URL] = { ok: true, status: 200, body: { data: [], total: 0, page: 1, pageSize: 1 } }
    const onClose = vi.fn()
    render(<TodayCheckSummary vehicleId="v1" open onClose={onClose} onRedo={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByText(NO_CHECK_TODAY)).toBeInTheDocument())
  })

  it('hardware/browser Back closes it instead of leaving Today (useHistoryGuard)', async () => {
    routes[LIST_URL] = { ok: true, status: 200, body: { data: [], total: 0, page: 1, pageSize: 1 } }
    const onClose = vi.fn()
    render(<TodayCheckSummary vehicleId="v1" open onClose={onClose} onRedo={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(NO_CHECK_TODAY)).toBeInTheDocument())
    // jsdom does not fire popstate on history.back() by itself (see useHistoryGuard.test).
    act(() => {
      window.history.back()
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
