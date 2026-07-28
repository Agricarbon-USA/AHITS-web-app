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
  // CC-32 (3.1): Map joins as a 6th tab (Max ruled 2026-07-28) — the crew map was
  // drawer-only, which cost a hamburger tap plus a drawer hunt every time. Requests
  // stays: demoting a surface CC-14 promoted for cause was the rejected alternative.
  it('includes a Requests tab and the CC-32 Map tab alongside the existing tabs', () => {
    countMock.mockReturnValue(0)
    render(<OperatorBottomNav />)
    for (const label of ['Home', 'Check', 'My Deployment', 'Requests', 'Scan', 'Map']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('renders exactly six tabs, with Map last and unbadged', () => {
    countMock.mockReturnValue(3)
    const { container } = render(<OperatorBottomNav />)
    const actions = container.querySelectorAll('.MuiBottomNavigationAction-root')
    expect(actions).toHaveLength(6)
    expect(actions[5]).toHaveTextContent('Map')
    // The pending badge belongs to My Deployment, not Map.
    expect(actions[5].querySelector('.MuiBadge-badge')).toBeNull()
    expect(actions[2]).toHaveTextContent('My Deployment')
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
