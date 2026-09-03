import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// CC-12 PR1: the 401-parked-queue prompt. When a flush parks on 401 with items
// still queued, the banner must prompt a re-login instead of the queue reading
// "waiting to sync" forever.

const queue = {
  isOffline: false, pending: 0, failed: 0, syncing: false, sessionExpired: false,
  listAll: vi.fn(async () => []), retryItem: vi.fn(async () => {}), discardFailed: vi.fn(async () => {}),
  listFailed: vi.fn(async () => []),
  idbWritable: true, possibleDataLoss: false, staleQueue: false, nearQuota: false, persistenceGranted: true,
}
vi.mock('@/hooks/useOfflineQueue', () => ({ useOfflineQueue: () => queue }))

import { OfflineBanner, PERSISTENCE_DISMISS_KEY, PERSISTENCE_DISMISS_TTL_MS } from '@/components/operator/OfflineBanner'

beforeEach(() => {
  Object.assign(queue, {
    isOffline: false, pending: 0, failed: 0, syncing: false, sessionExpired: false,
  })
})

describe('OfflineBanner — 401 parked prompt (CC-12 PR1)', () => {
  it('prompts sign-in with the parked count when the session expired', async () => {
    Object.assign(queue, { sessionExpired: true, pending: 2 })
    render(<OfflineBanner />)
    expect(await screen.findByText(/sign in to send 2 saved actions/i)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Sign in/i })
    expect(link).toHaveAttribute('href', '/login')
  })

  it('singularises the count for a single parked action', async () => {
    Object.assign(queue, { sessionExpired: true, pending: 1 })
    render(<OfflineBanner />)
    expect(await screen.findByText(/send 1 saved action\b/i)).toBeInTheDocument()
  })

  it('does not prompt when nothing is parked', async () => {
    Object.assign(queue, { sessionExpired: false, pending: 0 })
    const { container } = render(<OfflineBanner />)
    // Nothing renders (no banners) — and certainly no sign-in prompt.
    expect(screen.queryByText(/sign in to send/i)).not.toBeInTheDocument()
    expect(container.querySelector('[role="link"]')).toBeNull()
  })
})

// CC-32 (2.8) / P0-3: the queue banner was dead text — the Outbox opened only from the
// FAILED banner, so an operator whose actions were merely PENDING had no way to see
// what was in the queue and sent a "did my check go through?" text instead. The banner
// now carries the same door. Queue-engine internals are untouched.
describe('OfflineBanner — Outbox opens from the merely-PENDING queue banner (CC-32 2.8)', () => {
  it('offers View on the pending-queue banner and opens the Outbox', async () => {
    Object.assign(queue, { pending: 1 })
    render(<OfflineBanner />)

    expect(await screen.findByText(/1 action\(s\) waiting to sync/i)).toBeInTheDocument()
    const view = screen.getByRole('button', { name: 'View' })
    fireEvent.click(view)

    // The dialog opened and read the queue — no failed item required to get here.
    expect(await screen.findByRole('heading', { name: 'Outbox' })).toBeInTheDocument()
    await waitFor(() => expect(queue.listAll).toHaveBeenCalled())
  })

  it('offers View while offline with actions queued', async () => {
    Object.assign(queue, { isOffline: true, pending: 2 })
    render(<OfflineBanner />)

    expect(await screen.findByText(/2 action\(s\) queued/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(await screen.findByRole('heading', { name: 'Outbox' })).toBeInTheDocument()
  })
})

// UXP-1g / E1: the phantom-sync flash. The queue banner must NOT render on `syncing`
// alone (empty outbox, online) — that was the "Syncing 0 action(s)…" + spinner +
// layout-shift blink every 30s. It renders only when there is real work (pending > 0)
// or the device is offline.
describe('OfflineBanner — no phantom sync banner (UXP-1g / E1)', () => {
  it('renders NO queue banner when syncing with an empty, online queue', async () => {
    Object.assign(queue, { isOffline: false, pending: 0, failed: 0, syncing: true })
    render(<OfflineBanner />)
    // No "Syncing…", no "waiting to sync", no "queued" — nothing at all.
    expect(screen.queryByText(/Syncing/i)).toBeNull()
    expect(screen.queryByText(/waiting to sync/i)).toBeNull()
    expect(screen.queryByText(/queued/i)).toBeNull()
    expect(screen.queryByRole('button', { name: 'View' })).toBeNull()
  })

  it('still shows the full sync theater while real items are draining', async () => {
    Object.assign(queue, { isOffline: false, pending: 2, failed: 0, syncing: true })
    render(<OfflineBanner />)
    expect(await screen.findByText(/Syncing 2 action\(s\)…/i)).toBeInTheDocument()
  })
})

// UXP-3 (3i / A9): the persistence notice. It used to be dismissed in memory only, so a
// device that never grants persist() (iOS) saw it again on every launch. The dismissal now
// lives in localStorage for 90 days, the copy is one line, and the banner keeps losing to
// anything more important in the stack.
describe('OfflineBanner — persistence notice (UXP-3 3i)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    Object.assign(queue, { persistenceGranted: false })
  })
  afterEach(() => {
    Object.assign(queue, { persistenceGranted: true })
    window.localStorage.clear()
  })

  it('renders the one-line copy, no icon, with a 44px Dismiss when persistence is not granted', async () => {
    const { container } = render(<OfflineBanner />)
    expect(await screen.findByText("Offline saves aren't guaranteed on this device.")).toBeInTheDocument()
    expect(container.querySelector('.MuiAlert-icon')).toBeNull()
    const dismiss = screen.getByRole('button', { name: 'Dismiss' })
    expect(dismiss).toHaveStyle({ minHeight: '44px' })
  })

  it('Dismiss hides it and remembers the moment in localStorage', async () => {
    render(<OfflineBanner />)
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/Offline saves aren't guaranteed/)).toBeNull()
    const at = Number(window.localStorage.getItem(PERSISTENCE_DISMISS_KEY))
    expect(Number.isFinite(at)).toBe(true)
    expect(Math.abs(Date.now() - at)).toBeLessThan(5_000)
  })

  it('stays hidden on the next launch while the stored dismissal is fresh', async () => {
    window.localStorage.setItem(PERSISTENCE_DISMISS_KEY, String(Date.now() - 24 * 60 * 60 * 1000)) // yesterday
    const { container } = render(<OfflineBanner />)
    // Give the mount effect a tick, then assert nothing rendered.
    await waitFor(() => expect(container.querySelector('.MuiAlert-root')).toBeNull())
    expect(screen.queryByText(/Offline saves aren't guaranteed/)).toBeNull()
  })

  it('comes back once the stored dismissal is older than the 90-day TTL', async () => {
    window.localStorage.setItem(PERSISTENCE_DISMISS_KEY, String(Date.now() - PERSISTENCE_DISMISS_TTL_MS - 60_000))
    render(<OfflineBanner />)
    expect(await screen.findByText(/Offline saves aren't guaranteed/)).toBeInTheDocument()
  })

  it('treats a garbage stored value as not dismissed', async () => {
    window.localStorage.setItem(PERSISTENCE_DISMISS_KEY, 'yesterday-ish')
    render(<OfflineBanner />)
    expect(await screen.findByText(/Offline saves aren't guaranteed/)).toBeInTheDocument()
  })

  it('loses to the queue banner when actions are pending (stack collapses to one)', async () => {
    Object.assign(queue, { pending: 1 })
    render(<OfflineBanner />)
    expect(await screen.findByText(/1 action\(s\) waiting to sync/i)).toBeInTheDocument()
    expect(screen.queryByText(/Offline saves aren't guaranteed/)).toBeNull()
  })

  it('does not render when persistence IS granted', async () => {
    Object.assign(queue, { persistenceGranted: true })
    const { container } = render(<OfflineBanner />)
    await waitFor(() => expect(container.querySelector('.MuiAlert-root')).toBeNull())
    expect(screen.queryByText(/Offline saves aren't guaranteed/)).toBeNull()
  })
})
