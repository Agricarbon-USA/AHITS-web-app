import { render, screen } from '@testing-library/react'
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
