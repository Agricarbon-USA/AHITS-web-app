'use client'

import * as React from 'react'
import { INVALIDATE_EVENT, type EntityKey, type InvalidateDetail } from '@/lib/invalidation'

// PR-5: run `cb` when any of `keys` is invalidated (see src/lib/invalidation.ts).
// Coalesced: a burst of events (an offline queue draining ten items) runs `cb`
// once, COALESCE_MS after the last matching event, not ten times. `cb` is read
// through a ref, so an inline callback does not re-subscribe on every render.

export const COALESCE_MS = 150

export function useInvalidation(keys: readonly EntityKey[], cb: () => void): void {
  const cbRef = React.useRef(cb)
  React.useEffect(() => { cbRef.current = cb })
  const keySig = [...keys].sort().join(',')

  React.useEffect(() => {
    if (!keySig) return
    const wanted = new Set(keySig.split(','))
    let timer: ReturnType<typeof setTimeout> | null = null
    const onInvalidate = (e: Event) => {
      const detail = (e as CustomEvent<InvalidateDetail>).detail
      if (!detail?.keys?.some((k) => wanted.has(k))) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { timer = null; cbRef.current() }, COALESCE_MS)
    }
    window.addEventListener(INVALIDATE_EVENT, onInvalidate)
    return () => {
      window.removeEventListener(INVALIDATE_EVENT, onInvalidate)
      if (timer) clearTimeout(timer)
    }
  }, [keySig])
}
