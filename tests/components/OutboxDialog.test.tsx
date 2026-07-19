import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { OutboxDialog } from '@/components/operator/OutboxDialog'
import type { OfflineQueueItem } from '@/types'

// CC-12 PR1: the OUTBOX replaces the blind bulk "Dismiss all failed" with a
// per-item view + per-item Retry/Discard. Props-based (the owner passes its one
// queue instance), so no hook mock is needed.

const ITEMS: OfflineQueueItem[] = [
  { id: 1, endpoint: '/api/deployments', method: 'POST', body: {}, createdAt: 1, retries: 0, status: 'pending', label: 'Launch deployment' },
  { id: 2, endpoint: '/api/daily-check', method: 'POST', body: {}, createdAt: 2, retries: 3, status: 'failed', label: 'Daily check', lastError: 'Vehicle already checked today' },
]

function renderOutbox(over: Partial<React.ComponentProps<typeof OutboxDialog>> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    listAll: vi.fn(async () => ITEMS),
    retryItem: vi.fn(async () => {}),
    discardFailed: vi.fn(async () => {}),
    syncing: false,
    ...over,
  }
  render(<OutboxDialog {...props} />)
  return props
}

describe('OutboxDialog (CC-12 PR1)', () => {
  it('lists each queued item by label, with the failed item’s error', async () => {
    renderOutbox()
    expect(await screen.findByText('Launch deployment')).toBeInTheDocument()
    expect(screen.getByText('Daily check')).toBeInTheDocument()
    expect(screen.getByText(/Vehicle already checked today/)).toBeInTheDocument()
  })

  it('shows Retry/Discard only on the failed item and retries just that one', async () => {
    const props = renderOutbox()
    await screen.findByText('Daily check')
    // The pending item has no Retry/Discard; only the one failed item does.
    const retryButtons = screen.getAllByRole('button', { name: /Retry/i })
    expect(retryButtons).toHaveLength(1)
    fireEvent.click(retryButtons[0])
    await waitFor(() => expect(props.retryItem).toHaveBeenCalledWith(2))
  })

  it('discards a single failed item (not a bulk nuke)', async () => {
    const props = renderOutbox()
    await screen.findByText('Daily check')
    fireEvent.click(screen.getByRole('button', { name: /Discard/i }))
    await waitFor(() => expect(props.discardFailed).toHaveBeenCalledWith(2))
  })

  it('shows an empty state when nothing is queued', async () => {
    renderOutbox({ listAll: vi.fn(async () => []) })
    expect(await screen.findByText(/Nothing queued/i)).toBeInTheDocument()
  })
})
