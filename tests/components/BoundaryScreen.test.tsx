import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BoundaryScreen } from '@/components/ui/BoundaryScreen'

// UXP-1d: the shared branded boundary used by error.tsx + not-found.tsx. It must
// render the title/message and fire each escape's onClick — a crashed PWA with no URL
// bar has these buttons as its only way out.
describe('BoundaryScreen (UXP-1d)', () => {
  it('renders the title, message, and every escape action', () => {
    const reload = vi.fn()
    const home = vi.fn()
    render(
      <BoundaryScreen
        title="Something went wrong"
        message="Reload to try again."
        actions={[
          { label: 'Reload', primary: true, onClick: reload },
          { label: 'Go to Home', onClick: home },
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByText('Reload to try again.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Go to Home' }))
    expect(home).toHaveBeenCalled()
  })
})
