import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// CC-24: the single-item remove now routes through DispositionDialog (was a
// separate "Return Item" dialog). These tests cover the merged flow's tap-parity
// (open pre-filled → confirm) and the now-optional note.

type MutateArg = { endpoint: string; method: string; body: { note: string; itemDispositions: unknown[] }; label?: string }
const mutate = vi.fn(async (_opts: MutateArg) => ({ ok: true, queued: false, data: {} }))
vi.mock('@/hooks/useOfflineQueue', () => ({
  useOfflineQueue: () => ({ mutate, isOffline: false }),
}))
// PhotoCapture touches the browser photo store; stub it for the component test.
vi.mock('@/components/shared/PhotoCapture', () => ({
  PhotoCapture: () => null,
}))

import { DispositionDialog, type KitItemSummary, type HubOption } from '@/components/shared/DispositionDialog'

const ONE_ITEM: KitItemSummary[] = [{
  kitItemId: 'ki1', itemId: 'i1', name: 'Christie Drill', quantity: 1, itemType: 'SERIALIZED',
  inventoryUnit: { id: 'u1', qrCodeId: 'QR12345678', serialNumber: 'SN-1', status: 'CHECKED_OUT' },
}]
const HUBS: HubOption[] = [{ id: 'hub1', name: 'Home Lab', city: 'Austin', state: 'TX' }]

function renderDialog(extra: Partial<React.ComponentProps<typeof DispositionDialog>> = {}) {
  return render(
    <DispositionDialog
      open
      mode="remove-items"
      deploymentId="d1"
      currentOperatorId="op1"
      operators={[]}
      hubs={HUBS}
      items={ONE_ITEM}
      onComplete={() => {}}
      onClose={() => {}}
      {...extra}
    />,
  )
}

describe('DispositionDialog — merged single-item remove (CC-24)', () => {
  beforeEach(() => mutate.mockClear())

  it('pre-fills the one item with the confirm button live (2-tap parity)', () => {
    renderDialog()
    expect(screen.getByText('Christie Drill')).toBeInTheDocument()
    // Default disposition HUB + the one hub pre-selected → confirm is enabled on open,
    // so a single-item removal is 2 taps (open ⊖ → Return Items). No extra input needed.
    const confirm = screen.getByRole('button', { name: /Return Items/i })
    expect(confirm).toBeEnabled()
  })

  it('submits with an empty note by default (note is optional — no fake "Returned")', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /Return Items/i }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(mutate.mock.calls[0][0].body.note).toBe('')
  })

  it('fills the note from a one-tap preset', async () => {
    renderDialog({ presets: ['Picked up from hub', 'End of day return'] })
    fireEvent.click(screen.getByText('End of day return'))
    fireEvent.click(screen.getByRole('button', { name: /Return Items/i }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(mutate.mock.calls[0][0].body.note).toBe('End of day return')
  })
})
