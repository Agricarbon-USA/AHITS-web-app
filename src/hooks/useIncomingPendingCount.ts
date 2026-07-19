'use client'

import * as React from 'react'

// CC-14: the count of incoming PENDING transfers + handoffs waiting on the operator's
// Accept/Decline. Extracted from OperatorNav so the drawer item AND the bottom-bar tab
// share one source of truth (the packet: move the badge onto the bottom-bar tab, not
// just the drawer). Polls every 45s + on tab-visible; keeps the last-known count on a
// transient/offline failure. (On mobile the drawer only mounts while open, so the
// always-mounted bottom bar is the primary poller; a brief overlap when the drawer is
// open is harmless.)
export function useIncomingPendingCount(): number {
  const [pendingCount, setPendingCount] = React.useState(0)

  React.useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [tRes, hRes] = await Promise.all([
          fetch('/api/transfers?status=PENDING&direction=incoming'),
          fetch('/api/handoffs?status=PENDING&direction=incoming'),
        ])
        const transfers = tRes.ok ? await tRes.json() : []
        const handoffs = hRes.ok ? await hRes.json() : []
        if (active) {
          setPendingCount(
            (Array.isArray(transfers) ? transfers.length : 0) +
            (Array.isArray(handoffs) ? handoffs.length : 0),
          )
        }
      } catch {
        /* offline / transient — keep last known count */
      }
    }
    load()
    const t = window.setInterval(load, 45_000)
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { active = false; window.clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  return pendingCount
}
