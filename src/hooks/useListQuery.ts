'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { keysForEndpoint, type EntityKey } from '@/lib/invalidation'
import { useInvalidation } from '@/hooks/useInvalidation'

/**
 * PR-1a (RC-2 / D-h): the one list-read hook. A page that uses it cannot
 * silently truncate — it always holds the server's `total` and `truncated`
 * alongside the rows, and `PagedTable` renders them.
 *
 * What it owns:
 *  - `page` (0-based, MUI's convention) and `pageSize` (25/50/100, default 100);
 *  - the fetch — the caller debounces its own search box and passes the settled
 *    value in `params`;
 *  - **page reset on any filter change.** Showing page 4 of a freshly-filtered
 *    list is how a non-empty result renders as "nothing here";
 *  - `reload({ bypassCache })` after a mutation. With `bypassCache` the fetch
 *    goes out as `cache: 'reload'`, so the service worker's NetworkFirst cache
 *    can never hand an admin back the pre-mutation page (L-11).
 *
 * Why `page` is state and not `useSearchParams`: that hook forces the client tree
 * up to the nearest Suspense boundary to be client-rendered, and
 * `admin/maintenance` has no boundary (`admin/inventory` does). So `page` is
 * React state, seeded once from `window.location.search` and mirrored into the
 * URL with `router.replace` on an explicit page change — deep-linkable and
 * reload-safe, with no new boundary. (`useRouter`/`usePathname` carry no such
 * requirement; see node_modules/next/dist/docs — use-search-params.md §Behavior.)
 *
 * The automatic reset on a filter change is deliberately **state-only**: a filter
 * change is usually itself a `router.replace` (via `useUrlFilters`), and a second
 * concurrent replace reading `window.location` would race it. Callers that keep
 * filters in the URL clear the page key in the SAME `setFilters` patch
 * (`{ …, page: '' }` — one history entry); callers that do not just call
 * `setPage(0)` from their own handler.
 */

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

export interface ListQueryOptions {
  /** The list endpoint, no query string — e.g. `/api/inventory`. */
  endpoint: string
  /**
   * The filter/search params. Empty and `undefined` values are omitted. Its
   * serialized form is the identity this hook resets `page` on, so it is safe to
   * build inline from primitives.
   */
  params?: Record<string, string | undefined>
  /** Default 100 — the acceptance ("Showing 1–100 of 160") reads a full page. */
  pageSize?: number
  /** URL query key the page index is mirrored under. Default `page`. */
  pageParam?: string
  /** Skip the fetch entirely (e.g. a list whose dialog is not open). */
  enabled?: boolean
  /** Message surfaced on a failed read. */
  errorMessage?: string
  /**
   * PR-5: entity keys whose invalidation re-reads this list (bypassing the SW
   * cache). Default: the keys the endpoint shows (`keysForEndpoint`).
   */
  invalidatedBy?: EntityKey[]
}

export interface ListQueryResult<T> {
  rows: T[]
  total: number
  truncated: boolean
  loading: boolean
  error: string | null
  page: number
  pageSize: number
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  reload: (opts?: { bypassCache?: boolean }) => Promise<void>
  /** Any extra top-level keys the envelope carried (`facets`, `unread`, …). */
  extra: Record<string, unknown>
}

const ENVELOPE_KEYS = new Set(['data', 'total', 'page', 'pageSize', 'truncated'])

/** The page index the URL asked for, read once at mount. 0-based internally. */
function initialPage(pageParam: string): number {
  if (typeof window === 'undefined') return 0
  const raw = Number.parseInt(new URLSearchParams(window.location.search).get(pageParam) ?? '', 10)
  // The URL carries the 1-based page (what the API takes); state is 0-based.
  return Number.isFinite(raw) && raw > 1 ? raw - 1 : 0
}

export function useListQuery<T = unknown>(opts: ListQueryOptions): ListQueryResult<T> {
  const {
    endpoint,
    params,
    pageSize: defaultPageSize = 100,
    pageParam = 'page',
    enabled = true,
    errorMessage = 'Could not load the list.',
    invalidatedBy,
  } = opts

  const router = useRouter()
  const pathname = usePathname()

  const [page, setPageState] = React.useState(() => initialPage(pageParam))
  const [pageSize, setPageSizeState] = React.useState(defaultPageSize)
  const [rows, setRows] = React.useState<T[]>([])
  const [total, setTotal] = React.useState(0)
  const [truncated, setTruncated] = React.useState(false)
  const [extra, setExtra] = React.useState<Record<string, unknown>>({})
  const [loading, setLoading] = React.useState(enabled)
  const [error, setError] = React.useState<string | null>(null)

  // The filter identity. A change here is a NEW list, so page goes back to 0.
  const paramKey = React.useMemo(() => {
    const entries = Object.entries(params ?? {})
      .filter(([, v]) => v !== undefined && v !== '')
      .sort(([a], [b]) => a.localeCompare(b))
    return JSON.stringify(entries)
  }, [params])

  // Mirror the page into the URL. Page 1 is omitted so the URL stays clean.
  const syncPageToUrl = React.useCallback(
    (next: number) => {
      if (typeof window === 'undefined') return
      const search = new URLSearchParams(window.location.search)
      if (next <= 0) search.delete(pageParam)
      else search.set(pageParam, String(next + 1))
      const qs = search.toString()
      // No-op when the URL already says this. Without the guard, a caller that
      // calls `setPage(0)` on every keystroke issues a replace per keystroke,
      // and a redundant replace is one more chance to race a caller's own.
      if (qs === new URLSearchParams(window.location.search).toString()) return
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, pageParam],
  )

  const setPage = React.useCallback(
    (next: number) => {
      setPageState(next)
      syncPageToUrl(next)
    },
    [syncPageToUrl],
  )

  const setPageSize = React.useCallback(
    (next: number) => {
      setPageSizeState(next)
      // A different page size renumbers every page — land on the first one
      // rather than on a page index that may no longer exist.
      setPageState(0)
      syncPageToUrl(0)
    },
    [syncPageToUrl],
  )

  // Any filter change resets the page (state only — see the header note). Keyed
  // on paramKey, not the object, so a re-render with an identical filter set does
  // not bounce the reader back to page 1. This is React's documented
  // adjust-state-during-render pattern (not an effect), so the reset lands in the
  // same commit as the filter change and no fetch is ever issued for the old page.
  const [seenParamKey, setSeenParamKey] = React.useState(paramKey)
  if (seenParamKey !== paramKey) {
    setSeenParamKey(paramKey)
    if (page !== 0) setPageState(0)
  }

  const url = React.useMemo(() => {
    const search = new URLSearchParams()
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== '') search.set(k, v)
    }
    search.set('page', String(page + 1))
    search.set('pageSize', String(pageSize))
    return `${endpoint}?${search.toString()}`
  }, [endpoint, params, page, pageSize])

  const fetchList = React.useCallback(
    async (bypassCache: boolean) => {
      if (!enabled) return
      setLoading(true)
      try {
        const res = await fetch(url, bypassCache ? { cache: 'reload' } : undefined)
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        const json: unknown = await res.json()
        // Tolerates a bare array: `/api/deployments` and `/api/transfers` keep
        // that shape on purpose (sw.ts caches the former for offline reads).
        if (Array.isArray(json)) {
          setRows(json as T[])
          setTotal(json.length)
          setTruncated(false)
          setExtra({})
        } else {
          const body = (json ?? {}) as Record<string, unknown>
          const data = Array.isArray(body.data) ? (body.data as T[]) : []
          setRows(data)
          setTotal(typeof body.total === 'number' ? body.total : data.length)
          setTruncated(body.truncated === true)
          setExtra(Object.fromEntries(Object.entries(body).filter(([k]) => !ENVELOPE_KEYS.has(k))))
        }
        setError(null)
      } catch {
        setRows([])
        setTotal(0)
        setTruncated(false)
        setExtra({})
        setError(errorMessage)
      } finally {
        setLoading(false)
      }
    },
    [url, enabled, errorMessage],
  )

  React.useEffect(() => { void fetchList(false) }, [fetchList])

  const reload = React.useCallback(
    (o?: { bypassCache?: boolean }) => fetchList(o?.bypassCache === true),
    [fetchList],
  )

  // PR-5: a mutation anywhere on screen (or a queued one applied on drain) that
  // changes what this list shows re-reads it, past the service worker's cache.
  useInvalidation(invalidatedBy ?? keysForEndpoint(endpoint), () => { void fetchList(true) })

  return {
    rows, total, truncated, loading, error,
    page, pageSize, setPage, setPageSize, reload, extra,
  }
}
