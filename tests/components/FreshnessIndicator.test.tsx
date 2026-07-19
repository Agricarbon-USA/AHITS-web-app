import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FreshnessIndicator } from '@/components/shared/FreshnessIndicator'

// CC-12 PR2: the shared "Data as of HH:MM" indicator for cached list views.
describe('FreshnessIndicator (CC-12 PR2)', () => {
  it('shows "Data as of HH:MM" once data has loaded', () => {
    render(<FreshnessIndicator updatedAt={Date.parse('2026-07-19T14:32:00')} />)
    expect(screen.getByText(/Data as of \d/)).toBeInTheDocument()
  })

  it('shows Loading… before the first fetch', () => {
    render(<FreshnessIndicator updatedAt={null} />)
    expect(screen.getByText(/Loading…/)).toBeInTheDocument()
  })

  it('shows Refreshing… while revalidating', () => {
    render(<FreshnessIndicator updatedAt={Date.now()} isValidating />)
    expect(screen.getByText(/Refreshing…/)).toBeInTheDocument()
  })

  it('calls onRefresh when the refresh button is clicked, and disables it while validating', () => {
    const onRefresh = vi.fn()
    const { rerender } = render(<FreshnessIndicator updatedAt={Date.now()} onRefresh={onRefresh} />)
    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
    rerender(<FreshnessIndicator updatedAt={Date.now()} isValidating onRefresh={onRefresh} />)
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeDisabled()
  })

  it('renders no refresh button when onRefresh is not provided', () => {
    render(<FreshnessIndicator updatedAt={Date.now()} />)
    expect(screen.queryByRole('button', { name: /Refresh/i })).toBeNull()
  })
})
