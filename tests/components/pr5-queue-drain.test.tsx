// PR-5 (U-9 / FND-32): the queue-drain half of "screens reconcile". The REAL
// useOfflineQueue against a fake IndexedDB and a stubbed fetch (the harness of
// tests/offline/useOfflineQueue.test.tsx, which this PR leaves untouched):
//  - a write queued offline keeps its `invalidates` keys on the stored item;
//  - when flush() applies it, the keys are dispatched — so an offline End Deployment
//    clears the rig from screen once it syncs, without a reload;
//  - an item queued before PR-5 (no field) replays exactly as before and dispatches nothing;
//  - a terminal (4xx) failure dispatches nothing.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { INVALIDATE_EVENT, type InvalidateDetail } from '@/lib/invalidation'
import type { OfflineQueueItem } from '@/types'

function res(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

let _online = true
const setOnline = (v: boolean) => { _online = v }

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
      if (!open.result.objectStoreNames.contains('queue')) open.result.createObjectStore('queue', { keyPath: 'id', autoIncrement: true })
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

let events: InvalidateDetail[] = []
const onInvalidate = (e: Event) => events.push((e as CustomEvent<InvalidateDetail>).detail)

beforeEach(() => {
  ;(globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemStorage() })
  _online = true
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => _online })
  delete (navigator as unknown as { locks?: unknown }).locks
  events = []
  window.addEventListener(INVALIDATE_EVENT, onInvalidate)
})

afterEach(() => {
  window.removeEventListener(INVALIDATE_EVENT, onInvalidate)
  vi.unstubAllGlobals()
})

// Mounted OFFLINE so the mount-effect auto-flush no-ops; each test drives flush().
function mountOffline() {
  setOnline(false)
  return renderHook(() => useOfflineQueue())
}

describe('useOfflineQueue — PR-5 invalidates on drain', () => {
  it('a write queued offline keeps its keys, and the drain dispatches them when it applies', async () => {
    const { result } = mountOffline()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await act(async () => {
      const r = await result.current.mutate({
        endpoint: '/api/deployments/rig1/end', method: 'POST', body: { note: '' }, label: 'End deployment',
        invalidates: ['deployments', 'today'],
      })
      expect(r).toMatchObject({ ok: true, queued: true })
    })
    const [queued] = await readQueue()
    expect(queued?.invalidates).toEqual(['deployments', 'today'])
    expect(events).toEqual([]) // nothing applied yet

    vi.stubGlobal('fetch', vi.fn(async () => res(200, { ok: true })))
    setOnline(true)
    await act(async () => { await result.current.flush() })
    expect(await readQueue()).toEqual([])
    expect(events).toEqual([{ keys: ['deployments', 'today'] }])
  })

  it('an item queued before PR-5 (no invalidates field) replays as before and dispatches nothing', async () => {
    const { result } = mountOffline()
    await act(async () => {
      await result.current.enqueue({ endpoint: '/api/daily-check', method: 'POST', body: { vehicleId: 'v1' }, label: 'Daily check' })
    })
    const fetchMock = vi.fn(async () => res(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    setOnline(true)
    await act(async () => { await result.current.flush() })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await readQueue()).toEqual([])
    expect(events).toEqual([])
  })

  it('a terminal failure keeps the item (failed) and dispatches nothing', async () => {
    const { result } = mountOffline()
    await act(async () => {
      await result.current.enqueue({
        endpoint: '/api/deployments/rig1/end', method: 'POST', body: {}, label: 'End deployment', invalidates: ['deployments'],
      })
    })
    vi.stubGlobal('fetch', vi.fn(async () => res(409, { error: 'Deployment already ended' })))
    setOnline(true)
    await act(async () => { await result.current.flush() })
    const [item] = await readQueue()
    expect(item?.status).toBe('failed')
    expect(events).toEqual([])
  })
})
