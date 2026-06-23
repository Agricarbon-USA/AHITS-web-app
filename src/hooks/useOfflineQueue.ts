'use client'

import * as React from 'react'
import type { OfflineQueueItem, MutateResult } from '@/types'
import { resolvePhotoRefs } from '@/lib/photoStore'

const DB_NAME = 'ahits_offline'
const STORE = 'queue'
const DB_VERSION = 1
const MAX_RETRIES = 8

// HTTP statuses that mean "the server received and rejected this for good" —
// retrying will never succeed, so the item becomes "needs attention" instead of
// looping forever and wedging the queue.
const TERMINAL_STATUSES = new Set([400, 401, 403, 404, 409, 410, 422])

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function getAllItems(db: IDBDatabase): Promise<OfflineQueueItem[]> {
  return new Promise((res, rej) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    req.onsuccess = () => res(req.result as OfflineQueueItem[])
    req.onerror = () => rej(req.error)
  })
}

function putItem(db: IDBDatabase, item: OfflineQueueItem): Promise<void> {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(item)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}

function deleteItem(db: IDBDatabase, id: number): Promise<void> {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}

function newKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `k_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function extractError(body: unknown): string {
  if (!body || typeof body !== 'object') return 'Request failed'
  const b = body as Record<string, unknown>
  if (typeof b.error === 'string') return b.error
  // zod flatten() shape: surface a top-level formError, else the first
  // field-level message (e.g. "Note is required") so validation failures aren't
  // swallowed into a generic "Request failed".
  const err = b.error as { formErrors?: string[]; fieldErrors?: Record<string, string[] | undefined> } | undefined
  if (err?.formErrors?.[0]) return err.formErrors[0]
  if (err?.fieldErrors) {
    for (const msgs of Object.values(err.fieldErrors)) {
      if (msgs?.[0]) return msgs[0]
    }
  }
  return 'Request failed'
}

export function useOfflineQueue() {
  const [pending, setPending] = React.useState(0)
  const [failed, setFailed] = React.useState(0)
  const [syncing, setSyncing] = React.useState(false)
  const [isOffline, setIsOffline] = React.useState(
    typeof navigator !== 'undefined' && !navigator.onLine
  )
  const syncingRef = React.useRef(false)

  // Recompute honest counts straight from IndexedDB.
  const refresh = React.useCallback(async () => {
    try {
      const db = await openDB()
      const items = await getAllItems(db)
      setPending(items.filter((i) => i.status !== 'failed').length)
      setFailed(items.filter((i) => i.status === 'failed').length)
    } catch {
      /* IDB unavailable (private mode / SSR) — leave counts as-is */
    }
  }, [])

  const enqueue = React.useCallback(
    async (item: Omit<OfflineQueueItem, 'id' | 'retries' | 'createdAt'>) => {
      try {
        const db = await openDB()
        await putItem(db, {
          ...item,
          idempotencyKey: item.idempotencyKey ?? newKey(),
          retries: 0,
          status: 'pending',
          createdAt: Date.now(),
        } as OfflineQueueItem)
        await refresh()
      } catch {
        /* IDB unavailable (Safari private mode) — write silently dropped */
      }
    },
    [refresh]
  )

  const flush = React.useCallback(async () => {
    if (syncingRef.current || typeof navigator === 'undefined' || !navigator.onLine) return
    syncingRef.current = true
    setSyncing(true)
    try {
      const db = await openDB()
      const items = await getAllItems(db)
      for (const item of items) {
        if (item.status === 'failed' || item.id == null) continue
        // Upload any pending local photos and swap their `localphoto:` refs for
        // real URLs before sending. No-op for writes without photos.
        let work = item
        try {
          const body = await resolvePhotoRefs(item.body)
          if (body !== item.body) {
            work = { ...item, body }
            await putItem(db, work) // persist so a later retry doesn't re-upload
          }
        } catch {
          // Photos can't upload yet (still offline) — stop; retry next cycle.
          break
        }
        let res: Response
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (work.idempotencyKey) headers['Idempotency-Key'] = work.idempotencyKey
          res = await fetch(work.endpoint, {
            method: work.method,
            headers,
            body: work.body !== undefined ? JSON.stringify(work.body) : undefined,
          })
        } catch {
          // Network dropped mid-flush — stop; the rest stay pending for next time.
          break
        }
        if (res.ok) {
          await deleteItem(db, item.id)
        } else if (TERMINAL_STATUSES.has(res.status)) {
          const errBody = await res.json().catch(() => ({}))
          await putItem(db, { ...work, status: 'failed', lastError: extractError(errBody) })
        } else {
          // 5xx / 408 / 429 — transient; retry up to the cap.
          const retries = (work.retries ?? 0) + 1
          await putItem(db, {
            ...work,
            retries,
            ...(retries >= MAX_RETRIES ? { status: 'failed' as const, lastError: `Failed after ${MAX_RETRIES} attempts` } : {}),
          })
        }
      }
    } finally {
      syncingRef.current = false
      setSyncing(false)
      await refresh()
    }
  }, [refresh])

  // Drop a terminally-failed item the operator has acknowledged.
  const discardFailed = React.useCallback(
    async (id: number) => {
      const db = await openDB()
      await deleteItem(db, id)
      await refresh()
    },
    [refresh]
  )

  const listFailed = React.useCallback(async (): Promise<OfflineQueueItem[]> => {
    try {
      const db = await openDB()
      const items = await getAllItems(db)
      return items.filter((i) => i.status === 'failed')
    } catch {
      return []
    }
  }, [])

  /**
   * Try the network first; on a network failure (offline or unreachable) durably
   * queue the write with an idempotency key so it applies exactly once on replay.
   * Server-reached errors (4xx/5xx) are returned to the caller, not queued.
   */
  const mutate = React.useCallback(
    async <T = unknown>(args: {
      endpoint: string
      method?: OfflineQueueItem['method']
      body?: unknown
      label?: string
    }): Promise<MutateResult<T>> => {
      const method = args.method ?? 'POST'
      const idempotencyKey = newKey()
      // Upload any locally-stored photos now (online) and swap their
      // `localphoto:` refs for real URLs. If this throws (offline / upload
      // failed) we keep the original body — its local refs and stored blobs are
      // preserved, and flush() resolves them on reconnect.
      let body = args.body
      try {
        body = await resolvePhotoRefs(args.body)
      } catch {
        body = args.body
      }
      try {
        const res = await fetch(args.endpoint, {
          method,
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        if (res.ok) {
          const data = (await res.json().catch(() => null)) as T
          return { ok: true, queued: false, data }
        }
        const errBody = await res.json().catch(() => ({}))
        return { ok: false, queued: false, error: extractError(errBody), status: res.status }
      } catch {
        await enqueue({ endpoint: args.endpoint, method, body, idempotencyKey, label: args.label })
        return { ok: true, queued: true, data: null }
      }
    },
    [enqueue]
  )

  // Seed counts + flush on mount, and react to connectivity/visibility changes.
  React.useEffect(() => {
    // Ask the browser to keep our IndexedDB queue from being evicted under
    // storage pressure (matters most on iOS). Best-effort.
    navigator.storage?.persist?.().catch(() => {})
    refresh()
    flush()
    const onOnline = () => { setIsOffline(false); flush() }
    const onOffline = () => setIsOffline(true)
    const onVisible = () => { if (document.visibilityState === 'visible') flush() }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisible)
    const interval = window.setInterval(flush, 30_000)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(interval)
    }
  }, [refresh, flush])

  return {
    enqueue,
    flush,
    mutate,
    discardFailed,
    listFailed,
    refresh,
    // Honest indicators:
    pending,
    failed,
    syncing,
    isOffline,
  }
}
