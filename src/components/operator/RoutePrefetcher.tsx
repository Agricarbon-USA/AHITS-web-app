'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

// A6 offline-nav fix: App-Router tab switches are RSC fetches that only work
// offline if the route's RSC payload is already cached. router.prefetch() issues
// that RSC fetch (with the operator's cookies), which the service worker stores
// in the `ahits-app-rsc` cache — so by the time the operator loses signal, every
// reachable tab is cached and offline navigation between them works. Re-warms on
// reconnect. No-op while offline (nothing to fetch).
const PREFETCH_ROUTES = [
  // Operator primary tabs
  '/operator/dashboard',
  '/operator/daily-check',
  '/operator/my-rig',
  '/operator/scan',
  '/operator/requests',
  // Read-only admin browse surfaces operators can open
  '/admin/dashboard',
  '/admin/inventory',
  '/admin/deployments',
  '/admin/maintenance',
  '/admin/hubs',
  '/admin/projects',
  '/admin/vehicles',
]

export function RoutePrefetcher() {
  const router = useRouter()

  React.useEffect(() => {
    const warm = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      for (const route of PREFETCH_ROUTES) {
        try { router.prefetch(route) } catch { /* best-effort */ }
      }
    }
    warm()
    window.addEventListener('online', warm)
    return () => window.removeEventListener('online', warm)
  }, [router])

  return null
}
