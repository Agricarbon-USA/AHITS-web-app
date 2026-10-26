import { render } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import OfflinePage from '@/app/~offline/page'

// Hotfix 2026-10-25 (H2-c): the offline page is the one screen that still reloads when
// signal returns — it has nothing to lose, and reloading brings back the real screen.
// It does so with one inline, nonce'd script, which needs no JS chunks.

vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-nonce': 'test-nonce' }) }))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Hotfix 2026-10-25 · the offline page reloads itself when signal returns', () => {
  it('carries one nonce’d inline script that reloads on online, and only then', async () => {
    const { container } = render(await OfflinePage())
    const scripts = container.querySelectorAll('script')
    expect(scripts).toHaveLength(1)
    const script = scripts[0]
    expect(script.getAttribute('nonce')).toBe('test-nonce')

    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    new Function(script.textContent ?? '')()
    expect(reload).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('online'))
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
