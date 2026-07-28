import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { OutboxDialog } from '@/components/operator/OutboxDialog'
import type { OfflineQueueItem } from '@/types'

// CC-12 PR1: the OUTBOX replaces the blind bulk "Dismiss all failed" with a
// per-item view + per-item Retry/Discard. Props-based (the owner passes its one
// queue instance), so no hook mock is needed.

const ITEMS: OfflineQueueItem[] = [
  { id: 1, endpoint: '/api/deployments', method: 'POST', body: {}, createdAt: 1, retries: 0, status: 'pending', label: 'Start deployment' },
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
    expect(await screen.findByText('Start deployment')).toBeInTheDocument()
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
    // Exact name — item 1 is aged-out and now also renders a "Stuck? Discard"
    // button (CC-29 item 1b), so match the failed item's plain "Discard" only.
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(props.discardFailed).toHaveBeenCalledWith(2))
  })

  it('CC-29 item 1b: offers "Stuck? Discard" on a wedged NON-failed item and discards by id', async () => {
    // Item 1 is pending with an ancient createdAt → past the 24h "stuck" threshold.
    const props = renderOutbox()
    await screen.findByText('Start deployment')
    const stuck = await screen.findByRole('button', { name: /Stuck\? Discard/i })
    // window.confirm gates the destructive action — accept it, then it deletes by id.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(stuck)
    await waitFor(() => expect(props.discardFailed).toHaveBeenCalledWith(1))
    confirmSpy.mockRestore()
  })

  it('CC-29 item 1b: a declined confirm does NOT discard the stuck item', async () => {
    const props = renderOutbox()
    await screen.findByText('Start deployment')
    const stuck = await screen.findByRole('button', { name: /Stuck\? Discard/i })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(stuck)
    await new Promise((r) => setTimeout(r, 0))
    expect(props.discardFailed).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  // CC-32 (2.8): plainer empty-state copy — "All caught up — everything sent."
  it('shows an empty state when nothing is queued', async () => {
    renderOutbox({ listAll: vi.fn(async () => []) })
    expect(await screen.findByText(/All caught up/i)).toBeInTheDocument()
  })
})
