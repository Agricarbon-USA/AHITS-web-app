import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import {
  useIncomingPendingCount,
  notifyIncomingPendingChanged,
  INCOMING_PENDING_CHANGED,
} from '@/hooks/useIncomingPendingCount'

// UXP-3 (F-06): the pending transfer badge must recount the moment my-deployment
// finishes an accept / decline / cancel — not on the next 45s poll. The page fires
// `notifyIncomingPendingChanged()`; every mounted badge listens and reloads.
//
// Real timers throughout: each test completes in milliseconds, so a count that changes
// here changed because of the event, never because the 45s interval fired.

function Badge() {
  const n = useIncomingPendingCount()
  return <span data-testid="count">{n}</span>
}

let transfers: unknown[] = []
let handoffs: unknown[] = []
const fetchMock = vi.fn(async (url: string) => {
  const body = url.startsWith('/api/transfers') ? transfers : handoffs
  return { ok: true, json: async () => body } as unknown as Response
})

beforeEach(() => {
  transfers = []
  handoffs = []
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useIncomingPendingCount (UXP-3 F-06)', () => {
  it('counts incoming PENDING transfers + handoffs on mount', async () => {
    transfers = [{ id: 't1' }]
    handoffs = [{ id: 'h1' }, { id: 'h2' }]
    render(<Badge />)
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('3'))
    expect(fetchMock).toHaveBeenCalledWith('/api/transfers?status=PENDING&direction=incoming')
    expect(fetchMock).toHaveBeenCalledWith('/api/handoffs?status=PENDING&direction=incoming')
  })

  it('recounts immediately on notifyIncomingPendingChanged() — no 45s poll needed', async () => {
    transfers = [{ id: 't1' }]
    render(<Badge />)
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // The server now says nothing is pending (the operator just accepted it).
    transfers = []
    act(() => { notifyIncomingPendingChanged() })
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0'))
    // Exactly one extra recount (2 GETs), triggered by the event.
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('exports a stable event name and dispatches it on window', () => {
    expect(INCOMING_PENDING_CHANGED).toBe('ahits:incoming-pending-changed')
    const heard = vi.fn()
    window.addEventListener(INCOMING_PENDING_CHANGED, heard)
    notifyIncomingPendingChanged()
    expect(heard).toHaveBeenCalledTimes(1)
    window.removeEventListener(INCOMING_PENDING_CHANGED, heard)
  })

  it('removes the window listener on unmount — a later notify does not refetch', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<Badge />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    unmount()
    expect(removeSpy).toHaveBeenCalledWith(INCOMING_PENDING_CHANGED, expect.any(Function))

    fetchMock.mockClear()
    act(() => { notifyIncomingPendingChanged() })
    // Give any (wrongly) surviving listener a tick to fire before asserting.
    await new Promise((r) => setTimeout(r, 20))
    expect(fetchMock).not.toHaveBeenCalled()
    removeSpy.mockRestore()
  })
})
