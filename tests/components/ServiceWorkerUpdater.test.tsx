import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// UXP-1b (records D31): the update prompt must (a) stay silent on the first-ever
// install (the bare controllerchange listener used to fire on clientsClaim), (b) show
// a dismissible toast when a real controller swap happens under an open client, and
// (c) actually dismiss. sw.ts is NOT touched — this is UI-layer only.

type Listeners = Record<string, Array<() => void>>

function installFakeSW({ hasController }: { hasController: boolean }) {
  const listeners: Listeners = {}
  const sw = {
    controller: hasController ? ({} as ServiceWorker) : null,
    addEventListener: (type: string, cb: () => void) => {
      ;(listeners[type] ||= []).push(cb)
    },
    removeEventListener: (type: string, cb: () => void) => {
      listeners[type] = (listeners[type] || []).filter((f) => f !== cb)
    },
    // No registration → the getRegistration().then arm returns early; the
    // controllerchange path is what these tests exercise.
    getRegistration: () => Promise.resolve(undefined),
    __emit: (type: string) => (listeners[type] || []).forEach((cb) => cb()),
  }
  Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true })
  return sw
}

import { ServiceWorkerUpdater } from '@/components/shared/ServiceWorkerUpdater'

afterEach(() => {
  // Remove the stub so it can't leak into another suite.
  delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker
})

describe('ServiceWorkerUpdater (UXP-1b — D31 quiet update prompt)', () => {
  it('shows NOTHING on the first-ever install (no prior controller)', async () => {
    const sw = installFakeSW({ hasController: false })
    render(<ServiceWorkerUpdater />)
    // The initial clientsClaim fires controllerchange with no prior controller.
    await act(async () => {
      sw.__emit('controllerchange')
    })
    expect(screen.queryByText(/A new version of AHITS is available/i)).toBeNull()
  })

  it('shows a dismissible toast when a controller swap happens under an open client', async () => {
    const sw = installFakeSW({ hasController: true })
    render(<ServiceWorkerUpdater />)
    await act(async () => {
      sw.__emit('controllerchange')
    })
    expect(
      await screen.findByText(/A new version of AHITS is available/i)
    ).toBeInTheDocument()

    // Dismiss via the X — the review's core complaint was that it was undismissable.
    // The Snackbar plays an exit transition (real timers), so poll for removal.
    fireEvent.click(screen.getByRole('button', { name: /Dismiss update notice/i }))
    await waitFor(() =>
      expect(screen.queryByText(/A new version of AHITS is available/i)).toBeNull()
    )
  })

  it('offers a Reload action alongside the dismiss X', async () => {
    const sw = installFakeSW({ hasController: true })
    render(<ServiceWorkerUpdater />)
    await act(async () => {
      sw.__emit('controllerchange')
    })
    expect(await screen.findByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dismiss update notice/i })).toBeInTheDocument()
  })
})
