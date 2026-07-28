// CC-29 item 8 — the offline-queue flush lifecycle harness. The review's #1 missing
// test: "the pilot's most safety-critical function has zero direct coverage." These
// jsdom cases exercise the REAL hook against a fake IndexedDB and a stubbed fetch —
// no server, no DB. Run under `npm run test:ui` (vitest.config.ui.ts).
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { storeLocalPhoto } from '@/lib/photoStore'
import { IDEMPOTENCY_IN_FLIGHT_ERROR } from '@/lib/shared-errors'
import type { OfflineQueueItem } from '@/types'

// Mirrors the hook's module constants (not exported). If they change there, update here.
const MAX_RETRIES = 8
const MUTATE_TIMEOUT_MS = 12_000

// ── test doubles ────────────────────────────────────────────────────────────
// A duck-typed Response — the hook + uploadPhotoBlob only read ok/status/json().
function res(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

let _online = true
function setOnline(v: boolean) { _online = v }

// Node 26's built-in localStorage is inert without --localstorage-file, so provide a
// simple in-memory one — the hook uses it for the pending-hint and the flush lease.
class MemStorage implements Storage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  clear() { this.m.clear() }
  getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null }
}

async function readQueue(): Promise<OfflineQueueItem[]> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('ahits_offline', 1)
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains('queue')) {
        open.result.createObjectStore('queue', { keyPath: 'id', autoIncrement: true })
      }
    }
    open.onsuccess = () => {
      const db = open.result
      const req = db.transaction('queue', 'readonly').objectStore('queue').getAll()
      req.onsuccess = () => { resolve(req.result as OfflineQueueItem[]); db.close() }
      req.onerror = () => { reject(req.error); db.close() }
    }
    open.onerror = () => reject(open.error)
  })
}

beforeEach(() => {
  // Fresh IndexedDB + storage per case so queues/leases/blobs don't leak across tests.
  ;(globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemStorage() })
  localStorage.clear()
  _online = true
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => _online })
  // jsdom has no navigator.locks by default → the localStorage-lease fallback runs.
  delete (navigator as unknown as { locks?: unknown }).locks
  // jsdom's FormData rejects a fake-indexeddb Blob (Node vs jsdom realm mismatch —
  // a test artifact, not a product bug: real browsers share one realm). Every fetch
  // here is stubbed and never inspects the body, so a no-op FormData is sufficient
  // for uploadPhotoBlob to reach the (mocked) /api/uploads request.
  ;(globalThis as unknown as { FormData: unknown }).FormData = class { append() {} }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// Mount the hook already OFFLINE so the mount-effect auto-flush no-ops and each test
// drives flush()/mutate() explicitly (per the harness note: control navigator.onLine
// or the auto-flush races the explicit calls).
function mountOffline() {
  setOnline(false)
  return renderHook(() => useOfflineQueue())
}

describe('useOfflineQueue — CC-29 flush lifecycle', () => {
  // (a) photo-failure must NOT wedge later items.
  it('(a) server-reached photo failure burns retries and lets a later plain write drain past it', async () => {
    const { result } = mountOffline()
    const ref = await storeLocalPhoto(new Blob(['photo-bytes']))
    await act(async () => {
      await result.current.enqueue({ endpoint: '/api/deployments/d1/items', method: 'POST', body: { photoUrls: [ref] }, label: 'Damage report' })
      await result.current.enqueue({ endpoint: '/api/daily-check', method: 'POST', body: { vehicleId: 'v1' }, label: 'Daily check' })
    })

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/uploads')) return res(500, { error: 'file too large' }) // serverReached
      return res(200, { data: {} })
    })
    vi.stubGlobal('fetch', fetchMock)
    setOnline(true)

    // One pass: B (daily check) is sent even though A (photo) failed; A.retries = 1.
    await act(async () => { await result.current.flush() })
    let q = await readQueue()
    const a1 = q.find((i) => i.label === 'Damage report')
    const b1 = q.find((i) => i.label === 'Daily check')
    expect(b1).toBeUndefined() // drained past the wedge
    expect(a1?.status).not.toBe('failed')
    expect(a1?.retries).toBe(1)
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/daily-check'))).toBe(true)

    // Keep flushing → A reaches the cap and becomes 'failed' with a photo-naming error.
    for (let i = 0; i < MAX_RETRIES; i++) await act(async () => { await result.current.flush() })
    q = await readQueue()
    const aFinal = q.find((i) => i.label === 'Damage report')
    expect(aFinal?.status).toBe('failed')
    expect(aFinal?.lastError).toMatch(/photo could not be uploaded/i)
  })

  it('(a2) offline-throw photo failure keeps the item pending, burns NO retry, and does NOT send a later item', async () => {
    const { result } = mountOffline()
    const ref = await storeLocalPhoto(new Blob(['photo-bytes']))
    await act(async () => {
      await result.current.enqueue({ endpoint: '/api/deployments/d1/items', method: 'POST', body: { photoUrls: [ref] }, label: 'Damage report' })
      await result.current.enqueue({ endpoint: '/api/daily-check', method: 'POST', body: { vehicleId: 'v1' }, label: 'Daily check' })
    })

    // Upload fetch THROWS (offline) → PhotoUploadError serverReached=false → break, FIFO preserved.
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/uploads')) throw new TypeError('Failed to fetch')
      return res(200, { data: {} })
    })
    vi.stubGlobal('fetch', fetchMock)
    setOnline(true)

    await act(async () => { await result.current.flush() })
    const q = await readQueue()
    const a = q.find((i) => i.label === 'Damage report')
    const b = q.find((i) => i.label === 'Daily check')
    expect(a?.status).not.toBe('failed')
    expect(a?.retries ?? 0).toBe(0) // no retry burned — still offline
    expect(b).toBeDefined() // NOT sent — order preserved behind the head-of-line item
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/daily-check'))).toBe(false)
  })

  // (b) flush 401 parks and resumes.
  it('(b) a flush 401 parks the item (retries unburned) and sets sessionExpired; next 200 drains it', async () => {
    const { result } = mountOffline()
    await act(async () => {
      await result.current.enqueue({ endpoint: '/api/daily-check', method: 'POST', body: { vehicleId: 'v1' }, label: 'Daily check' })
    })

    let status = 401
    vi.stubGlobal('fetch', vi.fn(async () => res(status, { error: 'Unauthorized' })))
    setOnline(true)

    await act(async () => { await result.current.flush() })
    let q = await readQueue()
    expect(q).toHaveLength(1)
    expect(q[0].status).not.toBe('failed')
    expect(q[0].retries).toBe(0) // FND-14b: no retry burned
    expect(result.current.sessionExpired).toBe(true)

    // Re-authenticated → 200 drains it, sessionExpired clears.
    status = 200
    await act(async () => { await result.current.flush() })
    q = await readQueue()
    expect(q).toHaveLength(0)
    expect(result.current.sessionExpired).toBe(false)
  })

  // (c) mutate() bounds a hung fetch and enqueues at the timeout.
  it('(c) mutate() against a never-resolving fetch enqueues at ~MUTATE_TIMEOUT_MS', async () => {
    const { result } = mountOffline()
    setOnline(true)
    // Let the mount effect's async init() (storage probes + refresh) fully settle
    // under REAL timers before we switch to fake ones.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })

    // A fetch that only settles when its AbortSignal fires (lie-fi).
    vi.stubGlobal('fetch', vi.fn((_url: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    ))

    vi.useFakeTimers()
    let done: Awaited<ReturnType<typeof result.current.mutate>> | undefined
    await act(async () => {
      const p = result.current.mutate({ endpoint: '/api/daily-check', method: 'POST', body: { vehicleId: 'v1' }, label: 'Daily check' })
        .then((r) => { done = r })
      // Advance past the timeout → controller.abort() → fetch rejects → the catch
      // enqueues. runAllTimersAsync then drains fake-indexeddb's own faked timers so
      // the enqueue completes (advanceTimersByTimeAsync alone would drop them).
      await vi.advanceTimersByTimeAsync(MUTATE_TIMEOUT_MS)
      await vi.runAllTimersAsync()
      await p
    })
    vi.useRealTimers()

    expect(done).toMatchObject({ ok: true, queued: true })
    const q = await readQueue()
    expect(q).toHaveLength(1)
    expect(q[0].endpoint).toBe('/api/daily-check')
  })

  // (d) online-401 mutate parks with reason 'auth'.
  it('(d) an ONLINE 401 in mutate() parks the write and returns { queued:true, reason:"auth" }', async () => {
    const { result } = mountOffline()
    setOnline(true)
    vi.stubGlobal('fetch', vi.fn(async () => res(401, { error: 'Unauthorized' })))

    let done: Awaited<ReturnType<typeof result.current.mutate>> | undefined
    await act(async () => {
      done = await result.current.mutate({ endpoint: '/api/daily-check', method: 'POST', body: { vehicleId: 'v1' }, label: 'Daily check' })
    })

    expect(done).toMatchObject({ ok: true, queued: true, reason: 'auth' })
    expect(result.current.sessionExpired).toBe(true)
    const q = await readQueue()
    expect(q).toHaveLength(1)
    expect(q[0].endpoint).toBe('/api/daily-check')
  })

  // (e) two concurrent flush() owners drain each item exactly once.
  it('(e) two concurrent hook instances flush each queued item exactly once (localStorage lease)', async () => {
    setOnline(false)
    const a = renderHook(() => useOfflineQueue())
    const b = renderHook(() => useOfflineQueue())
    await act(async () => {
      await a.result.current.enqueue({ endpoint: '/api/daily-check', method: 'POST', body: { n: 1 }, label: 'c1' })
      await a.result.current.enqueue({ endpoint: '/api/deployments/d1/items', method: 'POST', body: { n: 2 }, label: 'c2' })
      await a.result.current.enqueue({ endpoint: '/api/deployments/d1/transfer', method: 'POST', body: { n: 3 }, label: 'c3' })
    })

    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { seen.push(String(url)); return res(200, { data: {} }) }))
    setOnline(true)

    await act(async () => { await Promise.all([a.result.current.flush(), b.result.current.flush()]) })

    // Each of the three endpoints hit exactly once — no double-send, no resurrection.
    expect(seen.filter((u) => u.includes('/api/daily-check'))).toHaveLength(1)
    expect(seen.filter((u) => u.includes('/items'))).toHaveLength(1)
    expect(seen.filter((u) => u.includes('/transfer'))).toHaveLength(1)
    expect(await readQueue()).toHaveLength(0)
  })

  it('(e2) two concurrent flushes with a stubbed navigator.locks also drain exactly once', async () => {
    setOnline(false)
    // Emulate navigator.locks: ifAvailable grants to the first, returns null to a
    // concurrent second (the packet asks to exercise this path too).
    const held = new Set<string>()
    ;(navigator as unknown as { locks: unknown }).locks = {
      request: async (name: string, opts: { ifAvailable?: boolean }, cb: (lock: unknown) => Promise<void>) => {
        if (opts.ifAvailable && held.has(name)) return cb(null)
        held.add(name)
        try { return await cb({ name }) } finally { held.delete(name) }
      },
    }
    const a = renderHook(() => useOfflineQueue())
    const b = renderHook(() => useOfflineQueue())
    await act(async () => {
      await a.result.current.enqueue({ endpoint: '/api/daily-check', method: 'POST', body: { n: 1 }, label: 'c1' })
      await a.result.current.enqueue({ endpoint: '/api/deployments/d1/items', method: 'POST', body: { n: 2 }, label: 'c2' })
    })
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { seen.push(String(url)); return res(200, { data: {} }) }))
    setOnline(true)
    await act(async () => { await Promise.all([a.result.current.flush(), b.result.current.flush()]) })
    expect(seen.filter((u) => u.includes('/api/daily-check'))).toHaveLength(1)
    expect(seen.filter((u) => u.includes('/items'))).toHaveLength(1)
    expect(await readQueue()).toHaveLength(0)
  })

  // (f) the 409 transient-vs-terminal contract.
  it('(f) an in-flight 409 stays retryable; a genuine 409 goes terminal', async () => {
    // Transient: body leads with the shared in-flight constant → retry, not failed.
    {
      const { result } = mountOffline()
      await act(async () => {
        await result.current.enqueue({ endpoint: '/api/daily-check', method: 'POST', body: { n: 1 }, label: 'transient' })
      })
      vi.stubGlobal('fetch', vi.fn(async () => res(409, { error: `${IDEMPOTENCY_IN_FLIGHT_ERROR} — retry after the original completes.` })))
      setOnline(true)
      await act(async () => { await result.current.flush() })
      const q = await readQueue()
      expect(q).toHaveLength(1)
      expect(q[0].status).not.toBe('failed') // still retryable
      expect(q[0].retries).toBe(1)
    }

    // Genuine: a real conflict message → terminal 'failed'.
    ;(globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
    localStorage.clear()
    {
      const { result } = mountOffline()
      await act(async () => {
        await result.current.enqueue({ endpoint: '/api/daily-check', method: 'POST', body: { n: 2 }, label: 'terminal' })
      })
      vi.stubGlobal('fetch', vi.fn(async () => res(409, { error: 'A check for 2026-07-27 already exists for this vehicle.' })))
      setOnline(true)
      await act(async () => { await result.current.flush() })
      const q = await readQueue()
      expect(q).toHaveLength(1)
      expect(q[0].status).toBe('failed')
      expect(q[0].lastError).toMatch(/already exists/i)
    }
  })
})
