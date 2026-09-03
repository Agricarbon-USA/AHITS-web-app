import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { SWRConfig } from 'swr'
import { useAuth } from '@/hooks/useAuth'
import { DRAFT_PREFIX, saveDraft, type DailyCheckDraftInput } from '@/lib/daily-check-draft'

// UXP-3 (3h) privacy, antagonist review: a sign-out must take the operator's
// daily-check drafts with it — the next user of a shared phone never inherits a
// half-done check. The draft keys carry the user id from the identity cache, so the
// purge has to read it BEFORE the cache is cleared; and storage that throws must
// never block the sign-out itself.

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }))

const ME = { userId: 'op-1', role: 'OPERATOR', name: 'Sam', email: 's@x' }
const TODAY = '2026-09-03'
const YESTERDAY = '2026-09-02'

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input)
  if (url === '/api/auth/me') return { ok: true, status: 200, json: async () => ME } as Response
  if (url === '/api/auth/logout') return { ok: true, status: 200, json: async () => ({}) } as Response
  return { ok: false, status: 404, json: async () => ({}) } as Response
})

function draft(over: Partial<DailyCheckDraftInput> = {}): DailyCheckDraftInput {
  return {
    vehicleId: 'v1', date: TODAY, step: 1, odometer: '12', site: '', siteTouched: false, issues: '',
    issuesPrefilled: false, rowsTouched: true,
    checklist: [{ key: 'brakes', label: 'Brakes', value: 'no', note: 'Soft pedal' }],
    elapsedMs: 1_000,
    ...over,
  }
}

const draftKeys = () => Object.keys(window.localStorage).filter((k) => k.startsWith(DRAFT_PREFIX)).sort()

// A fresh SWR cache per render, so one test's signed-out state never leaks into the next.
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
)

// Mount the hook and let SWR's mount-time /api/auth/me revalidation finish (its fetcher
// re-caches the identity), so the sign-out under test is the LAST writer of the cache.
async function mountSignedIn() {
  const hook = renderHook(() => useAuth(), { wrapper })
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/me'))
  await act(async () => {})
  return hook
}

beforeEach(() => {
  push.mockReset()
  replace.mockReset()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useAuth.logout purges the signed-in operator\'s drafts (UXP-3 3h privacy)', () => {
  it('drops this user\'s drafts — every vehicle, every date — leaves other users\', and still clears the identity + routes to /login', async () => {
    window.localStorage.setItem('ahits_identity', JSON.stringify(ME))
    saveDraft(draft({ vehicleId: 'v1', date: TODAY }))
    saveDraft(draft({ vehicleId: 'v2', date: YESTERDAY }))
    // Another operator's draft on the same phone is not ours to touch.
    window.localStorage.setItem(`${DRAFT_PREFIX}op-2:v1:${TODAY}`, JSON.stringify({ ...draft(), v: 1, savedAt: 1 }))
    expect(draftKeys()).toEqual([
      `${DRAFT_PREFIX}op-1:v1:${TODAY}`,
      `${DRAFT_PREFIX}op-1:v2:${YESTERDAY}`,
      `${DRAFT_PREFIX}op-2:v1:${TODAY}`,
    ])

    const { result } = await mountSignedIn()
    await act(async () => { await result.current.logout() })

    expect(draftKeys()).toEqual([`${DRAFT_PREFIX}op-2:v1:${TODAY}`])
    expect(window.localStorage.getItem('ahits_identity')).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    expect(push).toHaveBeenCalledWith('/login')
  })

  it('storage that throws never blocks the sign-out', async () => {
    window.localStorage.setItem('ahits_identity', JSON.stringify(ME))
    saveDraft(draft())
    // Enumerating keys blows up (quota / security error) — the purge is best-effort.
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => { throw new Error('SecurityError') })

    const { result } = await mountSignedIn()
    await act(async () => { await result.current.logout() })

    expect(window.localStorage.getItem('ahits_identity')).toBeNull()
    expect(push).toHaveBeenCalledWith('/login')
  })
})
