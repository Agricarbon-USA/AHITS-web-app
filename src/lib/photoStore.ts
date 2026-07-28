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

// CC-29 item 2: a hung photo upload on lie-fi wedges the queue exactly like a
// hung write, so uploadPhotoBlob() is bounded to this. Matches FLUSH_ITEM_TIMEOUT_MS
// in useOfflineQueue.ts (kept as a local constant here so photoStore has no
// dependency on the hook).
const PHOTO_UPLOAD_TIMEOUT_MS = 20_000

/**
 * CC-29 item 1a: a typed upload failure that tells the queue whether the SERVER
 * saw and rejected the photo (`serverReached: true` — 413/415/500…, a real failed
 * attempt that should burn a retry) versus the network never reaching it
 * (`serverReached: false` — offline/timeout, keep waiting, no retry burned).
 * resolvePhotoRefs propagates this unchanged so flush() can branch on it.
 */
export class PhotoUploadError extends Error {
  readonly serverReached: boolean
  // CC-30: the HTTP status when the server responded (undefined when it was never
  // reached). `message` may carry server-authored text — which can echo the stored
  // object path, and therefore the operator's original filename — so telemetry
  // reports this NUMBER instead of the message. The message stays operator-facing.
  readonly status?: number
  constructor(message: string, serverReached: boolean, status?: number) {
    super(message)
    this.name = 'PhotoUploadError'
    this.serverReached = serverReached
    this.status = status
  }
}

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

/**
 * Upload a blob to the photos bucket and return its URL. Throws a
 * {@link PhotoUploadError} on failure — `serverReached: false` when fetch itself
 * threw (offline / aborted timeout: keep waiting), `serverReached: true` when the
 * server saw and rejected it (413/415/500…: a real failed attempt).
 *
 * CC-29 item 2: bounded by PHOTO_UPLOAD_TIMEOUT_MS via AbortController+setTimeout
 * (NOT AbortSignal.timeout) so the abort path is deterministic under vitest fake
 * timers in the offline harness; a swallowed real timer would leave the same
 * lie-fi wedge as no timeout at all.
 */
export async function uploadPhotoBlob(blob: Blob, filename = `photo-${Date.now()}.jpg`): Promise<string> {
  const form = new FormData()
  form.append('file', blob, filename)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PHOTO_UPLOAD_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch('/api/uploads', { method: 'POST', body: form, signal: controller.signal })
  } catch (e) {
    // fetch threw (offline, DNS, or our abort) — the server was never reached.
    throw new PhotoUploadError(e instanceof Error ? e.message : 'Upload failed (network)', false)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new PhotoUploadError(
      typeof detail.error === 'string' ? detail.error : `Upload failed (${res.status})`,
      true, // the server responded — it saw and rejected this photo
      res.status,
    )
  }
  const data = await res.json()
  if (!data || typeof data.url !== 'string') {
    // A 2xx with no URL means the server DID process the request but returned an
    // unusable body — server-reached, so this counts as a real failed attempt.
    throw new PhotoUploadError('Upload returned no URL', true, res.status)
  }
  return data.url as string
}

/**
 * Upload a document (PDF or image) and return its URL. Used for rental
 * agreements (NEW-5), where the upload route additionally allows PDF via
 * `kind=document`. Content-type is still gated on the file's magic bytes
 * server-side (never the client claim). Throws on failure.
 */
export async function uploadDocument(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file, file.name || `document-${Date.now()}`)
  form.append('kind', 'document')
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

async function walk(value: unknown, deps: ResolveDeps, consumed: string[]): Promise<unknown | typeof DROP> {
  if (isLocalPhotoRef(value)) {
    const blob = await deps.getBlob(value)
    // Blob already uploaded or evicted — drop the now-meaningless local ref
    // rather than sending it to the server.
    if (!blob) return DROP
    const url = await deps.upload(blob) // throws on offline/failure → propagates so the caller can retry
    // Defer deletion: only record this ref as consumed. Blobs are deleted by
    // resolvePhotoRefs *after* the entire body resolves, so a failure on a
    // later photo can't strand an earlier, already-uploaded one.
    consumed.push(value)
    return url
  }
  if (Array.isArray(value)) {
    const out: unknown[] = []
    for (const el of value) {
      const w = await walk(el, deps, consumed)
      if (w !== DROP) out.push(w)
    }
    return out
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>)) {
      const w = await walk((value as Record<string, unknown>)[k], deps, consumed)
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
 * Throws if an upload fails (e.g. still offline) so the queue retries later —
 * and in that case NO blobs are deleted, so the retry re-uploads from the
 * intact blobs (a partial-batch failure can't lose already-uploaded photos).
 */
export async function resolvePhotoRefs<T>(body: T, deps: ResolveDeps = defaultDeps): Promise<T> {
  if (!hasLocalRefs(body)) return body
  const consumed: string[] = []
  const resolved = (await walk(body, deps, consumed)) as T
  // Reached only when every upload succeeded — safe to delete the uploaded blobs.
  await Promise.all(consumed.map((ref) => deps.deleteBlob(ref).catch(() => {})))
  return resolved
}
