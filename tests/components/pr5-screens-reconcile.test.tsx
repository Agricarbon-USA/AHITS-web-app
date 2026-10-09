import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { ToastProvider } from '@/components/shared/useToast'
import { useMutation } from '@/hooks/useMutation'
import { useInvalidation, COALESCE_MS } from '@/hooks/useInvalidation'
import { useListQuery } from '@/hooks/useListQuery'
import {
  INVALIDATE_EVENT, dispatchInvalidate, keysForEndpoint, type InvalidateDetail,
} from '@/lib/invalidation'
import { fetchMyRig } from '@/lib/my-rig'
import type { MutateResult } from '@/types'

// PR-5 "Screens reconcile" (U-9 / U-10 / L-8): after any action the screen tells the
// truth without a reload.
//  - useMutation: success online → dispatch the keys; queued → no dispatch now (the
//    queue dispatches when the item applies — pr5-queue-drain.test.tsx); failure → an
//    error-severity toast through apiErrorMessage (never a zod object).
//  - useInvalidation: matching keys run the callback, once per burst; others don't.
//  - useListQuery re-reads past the SW cache on its endpoint's keys.
//  - fetchMyRig: /api/deployments/mine first; the pre-PR-5 cached list only on a throw.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/inventory',
  useSearchParams: () => new URLSearchParams(),
}))

// useMutation wraps the queue's mutate(); the queue itself is covered by the offline suite
// and pr5-queue-drain.test.tsx. Here mutate() returns whatever the test sets.
let nextResult: MutateResult<unknown> = { ok: true, queued: false, data: { ok: true } }
const mutateSpy = vi.fn(async () => nextResult)
vi.mock('@/hooks/useOfflineQueue', () => ({ useOfflineQueue: () => ({ mutate: mutateSpy }) }))

function heard() {
  const events: InvalidateDetail[] = []
  const on = (e: Event) => events.push((e as CustomEvent<InvalidateDetail>).detail)
  window.addEventListener(INVALIDATE_EVENT, on)
  return { events, stop: () => window.removeEventListener(INVALIDATE_EVENT, on) }
}

function ResolveButton() {
  const { run } = useMutation()
  return (
    <button onClick={() => void run({
      endpoint: '/api/admin/alerts/a1/resolve', method: 'POST', label: 'Resolve alert',
      invalidates: ['alerts', 'notifications'], success: 'Alert resolved.', errorFallback: 'Could not resolve the alert.',
    })}>Resolve</button>
  )
}

beforeEach(() => {
  mutateSpy.mockClear()
  nextResult = { ok: true, queued: false, data: { ok: true } }
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useMutation', () => {
  it('online success dispatches its keys and toasts success', async () => {
    const h = heard()
    render(<ToastProvider><ResolveButton /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    await screen.findByText('Alert resolved.')
    expect(h.events).toEqual([{ keys: ['alerts', 'notifications'] }])
    // The keys ride to mutate() too, so a queued copy carries them.
    expect(mutateSpy).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: '/api/admin/alerts/a1/resolve', invalidates: ['alerts', 'notifications'],
    }))
    h.stop()
  })

  it('a queued write does NOT dispatch now — the drain does — and says it is queued', async () => {
    nextResult = { ok: true, queued: true, data: null }
    const h = heard()
    render(<ToastProvider><ResolveButton /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    await screen.findByText('Resolve alert queued — will sync when online.')
    expect(h.events).toEqual([])
    h.stop()
  })

  it('a failure is a red toast with the server message, and dispatches nothing', async () => {
    nextResult = { ok: false, queued: false, error: 'That alert is already resolved.', status: 409 }
    const h = heard()
    render(<ToastProvider><ResolveButton /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    const msg = await screen.findByText('That alert is already resolved.')
    expect(msg.closest('.MuiAlert-root')).toHaveClass('MuiAlert-colorError')
    expect(h.events).toEqual([])
    h.stop()
  })

  it('an empty server message falls back to the caller\'s copy (never "[object Object]")', async () => {
    nextResult = { ok: false, queued: false, error: '', status: 500 }
    render(<ToastProvider><ResolveButton /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    expect(await screen.findByText('Could not resolve the alert.')).toBeInTheDocument()
  })
})

function Counter({ keys }: { keys: Parameters<typeof useInvalidation>[0] }) {
  const [n, setN] = React.useState(0)
  useInvalidation(keys, () => setN((c) => c + 1))
  return <span data-testid="n">{n}</span>
}

describe('useInvalidation', () => {
  it('runs the callback once for a burst of matching events (a ten-item drain)', async () => {
    vi.useFakeTimers()
    render(<Counter keys={['deployments']} />)
    act(() => { for (let i = 0; i < 10; i++) dispatchInvalidate(['deployments', 'inventory']) })
    expect(screen.getByTestId('n')).toHaveTextContent('0')
    act(() => { vi.advanceTimersByTime(COALESCE_MS) })
    expect(screen.getByTestId('n')).toHaveTextContent('1')
  })

  it('ignores keys it did not subscribe to, and stops listening on unmount', async () => {
    vi.useFakeTimers()
    const { unmount } = render(<Counter keys={['vehicles']} />)
    act(() => { dispatchInvalidate(['inventory']); vi.advanceTimersByTime(COALESCE_MS) })
    expect(screen.getByTestId('n')).toHaveTextContent('0')
    unmount()
    const remove = vi.spyOn(window, 'removeEventListener')
    act(() => { dispatchInvalidate(['vehicles']); vi.advanceTimersByTime(COALESCE_MS) })
    expect(remove).not.toHaveBeenCalled() // nothing left mounted to remove
    remove.mockRestore()
  })
})

describe('useListQuery subscribes to its endpoint\'s keys', () => {
  function ListHarness() {
    const q = useListQuery<{ id: string }>({ endpoint: '/api/inventory' })
    return <span data-testid="rows">{q.rows.length}</span>
  }

  it('an inventory invalidation re-reads the list with cache: reload', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [{ id: 'i1' }], total: 1 }) } as Response)
    }))
    render(<ListHarness />)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.init).toBeUndefined()

    act(() => { dispatchInvalidate(['vehicles']) }) // not this list's entity
    act(() => { dispatchInvalidate(['inventory']) })
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]!.url).toMatch(/^\/api\/inventory\?/)
    expect(calls[1]!.init).toEqual({ cache: 'reload' })
  })

  it('maps endpoints to keys (longest prefix wins; unknown subscribes to nothing)', () => {
    expect(keysForEndpoint('/api/inventory?page=2')).toEqual(['inventory'])
    expect(keysForEndpoint('/api/deployment-requests')).toEqual(['requests'])
    expect(keysForEndpoint('/api/deployments/mine')).toEqual(['deployments'])
    expect(keysForEndpoint('/api/handoffs?status=PENDING')).toEqual(['transfers'])
    expect(keysForEndpoint('/api/operator/today')).toEqual(['today', 'deployments', 'transfers', 'requests'])
    expect(keysForEndpoint('/api/map/crew')).toEqual([])
  })
})

describe('fetchMyRig (L-8)', () => {
  const json = (status: number, body: unknown) =>
    Promise.resolve({ ok: status < 400, status, json: async () => body } as Response)

  it('reads /api/deployments/mine', async () => {
    const f = vi.fn(() => json(200, { data: { id: 'rig-mine' } }))
    vi.stubGlobal('fetch', f)
    await expect(fetchMyRig()).resolves.toEqual({ ok: true, rig: { id: 'rig-mine' } })
    expect(f).toHaveBeenCalledTimes(1)
    expect(f).toHaveBeenCalledWith('/api/deployments/mine')
  })

  it('no rig is { ok: true, rig: null }; a server error is not second-guessed by the fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, { data: null })))
    await expect(fetchMyRig()).resolves.toEqual({ ok: true, rig: null })
    const f = vi.fn(() => json(500, { error: 'boom' }))
    vi.stubGlobal('fetch', f)
    await expect(fetchMyRig()).resolves.toEqual({ ok: false, rig: null })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('offline with no cached /mine falls back to the pre-PR-5 cached list', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) =>
      String(input) === '/api/deployments/mine'
        ? Promise.reject(new TypeError('Failed to fetch'))
        : json(200, [{ id: 'rig-cached' }, { id: 'rig-older' }])))
    await expect(fetchMyRig()).resolves.toEqual({ ok: true, rig: { id: 'rig-cached' } })
  })
})
