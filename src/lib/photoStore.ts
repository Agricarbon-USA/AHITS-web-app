// ─────────────────────────────────────────────────────────────────────────
// Offline-capable photo storage
//
// A photo taken in the field may need to be attached to a write (damage
// report, disposition, transfer) that itself is queued offline. We can't put a
// real upload URL in that queued body because the upload hasn't happened yet.
//
// So a photo captured offline is stored as a Blob in IndexedDB under a stable
// local reference of the form `localphoto:<uuid>`. That reference is what flows
// through the UI and into the queued request body wherever a `photoUrls` entry
// would go. When connectivity returns, `resolvePhotoRefs()` walks the body,
// uploads each local blob to /api/uploads, and swaps the local reference for
// the real public URL before the request is (re)sent. The blob is deleted once
// it has been uploaded.
//
// This store is intentionally separate from the mutation queue's IndexedDB
// database so the two evolve independently.
// ─────────────────────────────────────────────────────────────────────────

export const LOCAL_PHOTO_PREFIX = 'localphoto:'

const DB_NAME = 'ahits_photos'
const STORE = 'photos'
const DB_VERSION = 1

export function isLocalPhotoRef(ref: unknown): ref is string {
  return typeof ref === 'string' && ref.startsWith(LOCAL_PHOTO_PREFIX)
}

function newRef(): string {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${LOCAL_PHOTO_PREFIX}${id}`
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

interface StoredPhoto {
  blob: Blob
  createdAt: number
}

/** Persist a compressed photo blob; returns its `localphoto:` reference. */
export async function storeLocalPhoto(blob: Blob): Promise<string> {
  const ref = newRef()
  const db = await openDB()
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ blob, createdAt: Date.now() } as StoredPhoto, ref)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
  return ref
}

export async function getLocalPhoto(ref: string): Promise<Blob | null> {
  try {
    const db = await openDB()
    return await new Promise<Blob | null>((res, rej) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(ref)
      req.onsuccess = () => res((req.result as StoredPhoto | undefined)?.blob ?? null)
      req.onerror = () => rej(req.error)
    })
  } catch {
    return null
  }
}

export async function deleteLocalPhoto(ref: string): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(ref)
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } catch {
    /* best-effort cleanup */
  }
}

/** Upload a blob to the photos bucket and return its URL. Throws on failure. */
export async function uploadPhotoBlob(blob: Blob, filename = `photo-${Date.now()}.jpg`): Promise<string> {
  const form = new FormData()
  form.append('file', blob, filename)
  const res = await fetch('/api/uploads', { method: 'POST', body: form })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(typeof detail.error === 'string' ? detail.error : `Upload failed (${res.status})`)
  }
  const data = await res.json()
  if (!data || typeof data.url !== 'string') throw new Error('Upload returned no URL')
  return data.url as string
}

export interface ResolveDeps {
  getBlob: (ref: string) => Promise<Blob | null>
  upload: (blob: Blob, filename?: string) => Promise<string>
  deleteBlob: (ref: string) => Promise<void>
}

const defaultDeps: ResolveDeps = {
  getBlob: getLocalPhoto,
  upload: uploadPhotoBlob,
  deleteBlob: deleteLocalPhoto,
}

const DROP = Symbol('drop-unresolvable-photo-ref')

function hasLocalRefs(body: unknown): boolean {
  try {
    return JSON.stringify(body ?? null)?.includes(LOCAL_PHOTO_PREFIX) ?? false
  } catch {
    return false
  }
}

async function walk(value: unknown, deps: ResolveDeps): Promise<unknown | typeof DROP> {
  if (isLocalPhotoRef(value)) {
    const blob = await deps.getBlob(value)
    // Blob already uploaded or evicted — drop the now-meaningless local ref
    // rather than sending it to the server.
    if (!blob) return DROP
    const url = await deps.upload(blob) // throws on offline/failure → propagates so the caller can retry
    await deps.deleteBlob(value)
    return url
  }
  if (Array.isArray(value)) {
    const out: unknown[] = []
    for (const el of value) {
      const w = await walk(el, deps)
      if (w !== DROP) out.push(w)
    }
    return out
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>)) {
      const w = await walk((value as Record<string, unknown>)[k], deps)
      out[k] = w === DROP ? null : w
    }
    return out
  }
  return value
}

/**
 * Walk a request body and replace every `localphoto:` reference with the real
 * URL produced by uploading its stored blob. Returns the SAME body reference
 * when there are no local refs (fast path — non-photo writes are untouched).
 * Throws if an upload fails (e.g. still offline) so the queue retries later.
 */
export async function resolvePhotoRefs<T>(body: T, deps: ResolveDeps = defaultDeps): Promise<T> {
  if (!hasLocalRefs(body)) return body
  return (await walk(body, deps)) as T
}
