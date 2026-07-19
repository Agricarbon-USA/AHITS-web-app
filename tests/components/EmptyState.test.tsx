import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { EmptyState } from '@/components/ui/EmptyState'

// CC-14: the demand-pull EmptyState primitive (first pulled by the Today "no active
// deployment" state).
describe('EmptyState (CC-14)', () => {
  it('renders the title and description', () => {
    render(<EmptyState title="No active deployment" description="Nothing to show yet." />)
    expect(screen.getByText('No active deployment')).toBeInTheDocument()
    expect(screen.getByText('Nothing to show yet.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders the action slot when provided', () => {
    render(<EmptyState title="Empty" action={<button>Do a thing</button>} />)
    expect(screen.getByRole('button', { name: 'Do a thing' })).toBeInTheDocument()
  })

  it('renders without an action or description', () => {
    render(<EmptyState title="Just a title" />)
    expect(screen.getByText('Just a title')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
