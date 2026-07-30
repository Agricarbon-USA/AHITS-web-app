import { render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// AppShell reads the offline queue for the header sync indicator — stub it flat.
vi.mock('@/hooks/useOfflineQueue', () => ({
  useOfflineQueue: () => ({ pending: 0, isOffline: false, syncing: false }),
}))
// ServiceWorkerUpdater pokes navigator.serviceWorker; render it inert here.
vi.mock('@/components/shared/ServiceWorkerUpdater', () => ({
  ServiceWorkerUpdater: () => null,
}))

import { AppShell } from '@/components/ui/AppShell'

// Control MUI's useMediaQuery by stubbing window.matchMedia. `matches(query)` decides
// which of the three queries (down('md'), down('lg'), (pointer: coarse)) are true.
function stubMatchMedia(matches: (query: string) => boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

const nav = <div data-testid="nav">nav</div>
const bottomNav = <div data-testid="bottom-nav">bottom</div>

afterEach(() => {
  // @ts-expect-error restore
  delete window.matchMedia
})

describe('AppShell — UXP-1c device-class operator shell (D32)', () => {
  beforeEach(() => {
    // A large TOUCH device (>lg width, coarse pointer): only the pointer heuristic
    // distinguishes it — the width-based md/lg queries are both false.
    stubMatchMedia((q) => q.includes('pointer: coarse'))
  })

  it("shellMode='device' treats a coarse-pointer viewport as mobile (bottom nav shown)", () => {
    render(<AppShell nav={nav} bottomNav={bottomNav} shellMode="device">content</AppShell>)
    expect(screen.getByTestId('bottom-nav')).toBeInTheDocument()
  })

  it("shellMode='admin' (default) ignores pointer — same viewport stays desktop (no bottom nav)", () => {
    render(<AppShell nav={nav} bottomNav={bottomNav}>content</AppShell>)
    // admin split is width down('md') only, which is false here → desktop shell.
    expect(screen.queryByTestId('bottom-nav')).toBeNull()
  })
})

describe('AppShell — UXP-1d cold load renders the mobile composition', () => {
  it('SSR/pre-mount output contains the bottom nav even when the media query is desktop', () => {
    // renderToString => mounted is false and MUI useMediaQuery returns its server
    // default (false), so effectiveIsMobile must fall to the mobile default (true).
    stubMatchMedia(() => false)
    const html = renderToString(
      <AppShell nav={nav} bottomNav={bottomNav} shellMode="device">content</AppShell>,
    )
    expect(html).toContain('data-testid="bottom-nav"')
    // The permanent 240px desktop drawer must NOT be in the cold-load HTML.
    expect(html).not.toContain('MuiDrawer-docked')
  })
})
