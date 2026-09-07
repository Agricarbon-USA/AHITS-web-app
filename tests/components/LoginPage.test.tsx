import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// UXP-3 (3b): lockout tells the truth. The login card used to render every failure as
// the same red "Invalid credentials" — a locked-out operator re-typed the right PIN for
// 15 minutes. Now a `locked` body renders a WARNING with the device-local unlock time and
// who to call; the generic 401 and the IP limiter's 429 copy are unchanged and separate.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

import LoginPage from '@/app/(auth)/login/page'

type FakeRes = { ok: boolean; status: number; json: () => Promise<unknown> }

// /api/auth/me → 401 (nobody signed in, so the UR-027 redirect never fires);
// /api/auth/login → whatever the case under test hands us.
function mockFetch(loginRes: FakeRes) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/auth/login')) return Promise.resolve(loginRes as Response)
    return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) } as Response)
  })
}

async function signIn() {
  fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'op@test.example' } })
  fireEvent.change(screen.getByLabelText(/6-Digit PIN/i), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: /Sign In/i }))
}

beforeEach(() => { vi.useRealTimers() })
afterEach(() => { vi.unstubAllGlobals() })

describe('LoginPage — lockout tells the truth (UXP-3 3b)', () => {
  it('a locked body renders a warning with the device-local unlock time and the contact', async () => {
    const lockedUntil = new Date(Date.now() + 15 * 60 * 1000)
    vi.stubGlobal('fetch', mockFetch({
      ok: false, status: 401,
      json: async () => ({ error: 'Too many attempts — your account is temporarily locked.', locked: true, lockedUntil: lockedUntil.toISOString() }),
    }))
    render(<LoginPage />)
    await signIn()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Too many attempts — locked until \d{1,2}:\d{2}/)
    expect(alert).toHaveTextContent(/Contact your ops lead if urgent\./)
    // The exact HH:MM is the device-local rendering of the server's ISO stamp.
    expect(alert).toHaveTextContent(lockedUntil.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    // Warning, not error — MUI stamps the severity class on the root.
    expect(alert.className).toMatch(/MuiAlert-(standard|filled|outlined)Warning/)
    // The button stays live: auto-unlock is server-side, a retry after HH:MM just works.
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeEnabled()
  })

  it('falls back to "for 15 minutes" when lockedUntil is missing or unparsable', async () => {
    vi.stubGlobal('fetch', mockFetch({
      ok: false, status: 401,
      json: async () => ({ error: 'Too many attempts — your account is temporarily locked.', locked: true, lockedUntil: 'not-a-date' }),
    }))
    render(<LoginPage />)
    await signIn()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Too many attempts — locked for 15 minutes. Contact your ops lead if urgent.')
  })

  it('the generic 401 still renders "Invalid credentials" as an error — no lock copy, no time', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: false, status: 401, json: async () => ({ error: 'Invalid credentials' }) }))
    render(<LoginPage />)
    await signIn()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Invalid credentials')
    expect(alert.className).toMatch(/MuiAlert-(standard|filled|outlined)Error/)
    expect(screen.queryByText(/locked until/)).not.toBeInTheDocument()
  })

  it('the IP limiter 429 renders its own copy verbatim (kept separate from the lock)', async () => {
    vi.stubGlobal('fetch', mockFetch({
      ok: false, status: 429,
      json: async () => ({ error: 'Too many attempts. Please wait a few minutes and try again.' }),
    }))
    render(<LoginPage />)
    await signIn()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Too many attempts. Please wait a few minutes and try again.')
    expect(alert.className).toMatch(/MuiAlert-(standard|filled|outlined)Error/)
    expect(screen.queryByText(/ops lead/)).not.toBeInTheDocument()
  })

  it('a lock notice clears on the next attempt (a later generic failure does not stack two alerts)', async () => {
    const fetchMock = mockFetch({
      ok: false, status: 401,
      json: async () => ({ error: 'x', locked: true, lockedUntil: new Date(Date.now() + 60_000).toISOString() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<LoginPage />)
    await signIn()
    await screen.findByText(/locked until/)

    // Second attempt: the server now answers the generic 401.
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/auth/login')) {
        return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'Invalid credentials' }) } as Response)
      }
      return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) } as Response)
    })
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }))
    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument())
    expect(screen.queryByText(/locked until/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })
})
