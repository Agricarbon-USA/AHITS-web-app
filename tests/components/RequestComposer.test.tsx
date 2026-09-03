import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// UXP-3 (3f / F-09): the composer meets the common case. It opens in the last-used mode
// remembered on this device, else the caller's `initialMode` (the operator page's
// active-rig heuristic), else RESERVATION. A successful submit remembers the mode.

vi.mock('@/hooks/useHistoryGuard', () => ({ useHistoryGuard: () => {} }))

import { RequestComposer, REQUEST_MODE_KEY, type RequestComposerBody } from '@/components/shared/RequestComposer'

const HUBS = [{ id: 'h1', name: 'Toledo Hub', city: 'Toledo', state: 'OH' }]
const CATEGORIES = [{ id: 'c1', name: 'Sampling' }]

function renderComposer(props: Partial<React.ComponentProps<typeof RequestComposer>> = {}) {
  const onSubmit = vi.fn(async (_body: RequestComposerBody) => ({ ok: true }))
  const onClose = vi.fn()
  render(
    <RequestComposer
      hubs={HUBS} projects={[]} inventory={[]} vehicles={[]} categories={CATEGORIES}
      onSubmit={onSubmit} onClose={onClose} {...props}
    />,
  )
  return { onSubmit, onClose }
}

const reserveBtn = () => screen.getByRole('button', { name: 'Reserve a rig' })
const materialBtn = () => screen.getByRole('button', { name: 'Request materials' })

beforeEach(() => {
  window.localStorage.clear()
})

describe('RequestComposer — opening mode (UXP-3 3f)', () => {
  it('defaults to RESERVATION with nothing remembered and no initialMode', () => {
    renderComposer()
    expect(reserveBtn()).toHaveAttribute('aria-pressed', 'true')
    expect(materialBtn()).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText(/^Hub/)).toBeInTheDocument()
  })

  it("opens in MATERIAL when the caller's initialMode says so", () => {
    renderComposer({ initialMode: 'MATERIAL' })
    expect(materialBtn()).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Needed by')).toBeInTheDocument()
    expect(screen.getByLabelText('Notes (optional)')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Hub/)).toBeNull()
  })

  it('a remembered MATERIAL beats initialMode=RESERVATION (last-used wins)', () => {
    window.localStorage.setItem(REQUEST_MODE_KEY, 'MATERIAL')
    renderComposer({ initialMode: 'RESERVATION' })
    expect(materialBtn()).toHaveAttribute('aria-pressed', 'true')
  })

  it('a remembered RESERVATION beats initialMode=MATERIAL too', () => {
    window.localStorage.setItem(REQUEST_MODE_KEY, 'RESERVATION')
    renderComposer({ initialMode: 'MATERIAL' })
    expect(reserveBtn()).toHaveAttribute('aria-pressed', 'true')
  })

  it('ignores a garbage stored value and falls through to initialMode / RESERVATION', () => {
    window.localStorage.setItem(REQUEST_MODE_KEY, 'BANANA')
    renderComposer()
    expect(reserveBtn()).toHaveAttribute('aria-pressed', 'true')
  })

  it('remembers the mode after a successful submit', async () => {
    const { onSubmit, onClose } = renderComposer({ initialMode: 'MATERIAL' })
    // The default KIT_ITEM line is valid once a category fallback is chosen.
    fireEvent.mouseDown(screen.getByLabelText('Category'))
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Sampling'))
    const submit = screen.getByRole('button', { name: 'Submit Request' })
    await waitFor(() => expect(submit).toBeEnabled())
    fireEvent.click(submit)

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ requestType: 'MATERIAL' })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(window.localStorage.getItem(REQUEST_MODE_KEY)).toBe('MATERIAL')
  })

  it('does not remember the mode when the submit fails', async () => {
    const onSubmit = vi.fn(async (_body: RequestComposerBody) => ({ ok: false, error: 'nope' }))
    renderComposer({ initialMode: 'MATERIAL', onSubmit })
    fireEvent.mouseDown(screen.getByLabelText('Category'))
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Sampling'))
    const submit = screen.getByRole('button', { name: 'Submit Request' })
    await waitFor(() => expect(submit).toBeEnabled())
    fireEvent.click(submit)

    expect(await screen.findByText('nope')).toBeInTheDocument()
    expect(window.localStorage.getItem(REQUEST_MODE_KEY)).toBeNull()
  })
})
