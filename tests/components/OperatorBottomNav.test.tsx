import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// CC-14: Requests added to the bottom bar; the pending transfer/handoff badge moved
// onto the My Deployment tab (was drawer-only). Mock the router + the count hook.
vi.mock('next/navigation', () => ({
  usePathname: () => '/operator/dashboard',
  useRouter: () => ({ push: vi.fn() }),
}))
const countMock = vi.fn(() => 0)
vi.mock('@/hooks/useIncomingPendingCount', () => ({
  useIncomingPendingCount: () => countMock(),
}))

import { OperatorBottomNav } from '@/components/operator/OperatorBottomNav'

describe('OperatorBottomNav (CC-14)', () => {
  it('includes a Requests tab alongside the existing tabs', () => {
    countMock.mockReturnValue(0)
    render(<OperatorBottomNav />)
    for (const label of ['Home', 'Check', 'My Deployment', 'Requests', 'Scan']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('shows the pending badge on the bottom bar when there are incoming items', () => {
    countMock.mockReturnValue(3)
    render(<OperatorBottomNav />)
    expect(screen.getByText('3')).toBeInTheDocument() // MUI Badge content
  })

  it('renders no badge when nothing is pending', () => {
    countMock.mockReturnValue(0)
    render(<OperatorBottomNav />)
    expect(screen.queryByText('3')).toBeNull()
  })
})
