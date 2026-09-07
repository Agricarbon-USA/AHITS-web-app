import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ToastProvider, useToast } from '@/components/shared/useToast'

// UXP-6 (6a): the toast API gains an optional `action` ("Sample bags added · Open").
// Existing calls (no action) are byte-for-byte the same toast with its close X.

function Trigger({ withAction, onOpen }: { withAction: boolean; onOpen?: () => void }) {
  const showToast = useToast()
  return (
    <button
      onClick={() =>
        showToast(
          withAction
            ? { message: 'Sample bags added', action: { label: 'Open', onClick: onOpen ?? (() => {}) } }
            : { message: 'Sample bags added' },
        )
      }
    >
      fire
    </button>
  )
}

describe('useToast — action slot (UXP-6 6a)', () => {
  it('renders the action button and fires its handler, then closes the toast', async () => {
    const onOpen = vi.fn()
    render(
      <ToastProvider>
        <Trigger withAction onOpen={onOpen} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('fire'))
    expect(await screen.findByText('Sample bags added')).toBeInTheDocument()

    const action = screen.getByRole('button', { name: 'Open' })
    // 44px target on a phone.
    expect(action).toHaveStyle({ minHeight: '44px' })
    fireEvent.click(action)
    expect(onOpen).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByText('Sample bags added')).not.toBeInTheDocument())
  })

  it('still offers a Close control next to the action', async () => {
    render(
      <ToastProvider>
        <Trigger withAction />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('fire'))
    await screen.findByText('Sample bags added')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByText('Sample bags added')).not.toBeInTheDocument())
  })

  it('is backward compatible: no action → no action button, the close X remains', async () => {
    render(
      <ToastProvider>
        <Trigger withAction={false} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('fire'))
    await screen.findByText('Sample bags added')
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})
