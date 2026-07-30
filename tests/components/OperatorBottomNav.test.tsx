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

// UXP-1a (records D30, supersedes D28): FIVE tabs. Map is demoted back to the drawer
// (the six-tab bar clipped every phone width — MUI's 80px-per-action floor made the
// content 480px). Map stays reachable via OperatorNav's "Crew Map" entry.
describe('OperatorBottomNav (UXP-1a — D30 five-tab bar)', () => {
  // THE GUARD: this exact ordered label set is the D30 contract. If a future packet
  // adds a sixth tab, this fails loudly — re-open D30 (and re-verify the width math:
  // 6 × MUI's 80px floor overflows even with the minWidth:0 override) before changing
  // it. Do not "fix" the test to make a sixth tab pass.
  const EXPECTED_LABELS = ['Home', 'Check', 'My Deployment', 'Requests', 'Scan']

  it('renders exactly the five D30 tabs, in order, with Map NOT present', () => {
    countMock.mockReturnValue(0)
    const { container } = render(<OperatorBottomNav />)
    const actions = container.querySelectorAll('.MuiBottomNavigationAction-root')

    expect(actions).toHaveLength(EXPECTED_LABELS.length) // exactly 5 — see D30 guard above
    EXPECTED_LABELS.forEach((label, i) => {
      expect(actions[i]).toHaveTextContent(label)
    })
    // Map was a tab under D28; it must be gone from the bar (drawer-only now).
    expect(screen.queryByText('Map')).toBeNull()
  })

  it('applies the UXP-1a minWidth override so five tabs fit narrow phones', () => {
    // jsdom can't measure px widths (getBoundingClientRect returns zeros), so assert
    // the override is present on the rendered actions; the 320/375/390/430 pixel
    // acceptance rides the staging smoke row.
    countMock.mockReturnValue(0)
    const { container } = render(<OperatorBottomNav />)
    const action = container.querySelector('.MuiBottomNavigationAction-root') as HTMLElement
    expect(action).not.toBeNull()
    expect(action).toHaveStyle({ minWidth: '0px' })
  })

  it('keeps the pending badge on My Deployment and never on another tab', () => {
    countMock.mockReturnValue(3)
    const { container } = render(<OperatorBottomNav />)
    const actions = container.querySelectorAll('.MuiBottomNavigationAction-root')
    const myDeployment = actions[EXPECTED_LABELS.indexOf('My Deployment')]
    expect(myDeployment).toHaveTextContent('My Deployment')
    expect(myDeployment.querySelector('.MuiBadge-badge')).not.toBeNull()
    // No other tab carries a badge.
    actions.forEach((a, i) => {
      if (i === EXPECTED_LABELS.indexOf('My Deployment')) return
      expect(a.querySelector('.MuiBadge-badge')?.textContent || '').not.toMatch(/\d/)
    })
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
