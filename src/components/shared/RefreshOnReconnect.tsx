'use client'
import * as React from 'react'
import { ENTITY_KEYS, dispatchInvalidate } from '@/lib/invalidation'

// Hotfix 2026-10-25: signal returning no longer reloads the page (next.config.ts
// reloadOnOnline: false). Instead, tell every mounted screen to re-read its data,
// through the same invalidation event a drained queue already uses. Screen state is
// untouched, except what a re-read already resets (see the packet). At most once per
// 10 s, so a flapping signal doesn't flood reads.
export function RefreshOnReconnect() {
  React.useEffect(() => {
    let last = 0
    const onOnline = () => {
      const now = Date.now()
      if (now - last < 10_000) return
      last = now
      dispatchInvalidate(ENTITY_KEYS)
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])
  return null
}
