import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { OfflineBanner } from '@/components/operator/OfflineBanner'

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
