'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * FND-48: persist a set of string filters in the URL query string so admin list
 * views are deep-linkable (e.g. a notification or the week board can open a page
 * pre-filtered) and survive a reload. The URL is the source of truth.
 *
 * `setFilters` patches one OR MORE keys in a SINGLE history-replace, so clearing
 * several filters at once can't race (a per-key setter would read a stale snapshot
 * and drop all but the last change). Empty values (and values equal to the default)
 * are omitted so the URL stays clean. `scroll: false` keeps the list position.
 *
 * Pass a STABLE `defaults` object (declare it at module scope) so the setter
 * callback is stable across renders.
 */
export function useUrlFilters<T extends Record<string, string>>(
  defaults: T,
): { filters: T; setFilters: (patch: Partial<T>) => void } {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Read straight from the URL — the URL is the source of truth. Memoized on the
  // search string so the returned object is referentially stable across renders that
  // don't change the query (safe to use in a caller's effect/memo dep array).
  const filters = React.useMemo(() => {
    const out = {} as T
    for (const key of Object.keys(defaults) as (keyof T & string)[]) {
      const v = searchParams.get(key)
      out[key] = (v ?? defaults[key]) as T[typeof key]
    }
    return out
  }, [searchParams, defaults])

  const setFilters = React.useCallback(
    (patch: Partial<T>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue
        if (value === '' || value === defaults[key]) params.delete(key)
        else params.set(key, value)
      }
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [searchParams, pathname, router, defaults],
  )

  return { filters, setFilters }
}
