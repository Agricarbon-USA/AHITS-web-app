// PR-5 (L-8): the client read of "my active rig" — every operator surface calls
// this instead of picking `GET /api/deployments`[0] its own way.
//
// Offline: sw.ts caches /api/deployments/mine NetworkFirst under its existing
// `/api/deployments` prefix rule. A phone that updates and loses signal before it
// ever read /mine online has no entry for it yet, so a THROWN fetch (no network,
// nothing cached) falls back to the list endpoints those pages read before PR-5,
// which that phone does have cached. A server answer (any status) is never
// second-guessed by the fallback.

const LEGACY_LIST_URLS = ['/api/deployments?active=true', '/api/deployments']

export interface MyRigResult<T> {
  /** false when nothing could be read (offline with no cache, or a server error). */
  ok: boolean
  rig: T | null
}

export async function fetchMyRig<T = unknown>(): Promise<MyRigResult<T>> {
  try {
    const res = await fetch('/api/deployments/mine')
    if (!res.ok) return { ok: false, rig: null }
    const json = (await res.json()) as { data?: T | null } | null
    return { ok: true, rig: json?.data ?? null }
  } catch {
    /* no network and no cached /mine — try the pre-PR-5 cached list below */
  }
  for (const url of LEGACY_LIST_URLS) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const json: unknown = await res.json()
      return { ok: true, rig: Array.isArray(json) ? ((json[0] as T | undefined) ?? null) : null }
    } catch {
      /* not cached either */
    }
  }
  return { ok: false, rig: null }
}
