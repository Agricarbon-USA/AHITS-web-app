'use client'

import * as React from 'react'

// CC-23: collapse-to-one banner host. Given N candidate banners, it renders only
// the single highest-priority one, so up to 7 stacked alerts (the old
// OfflineBanner) never pile up and push the app down. Mounts into the full-bleed
// AppShell banner slot.
//
// Global priority order (lower number wins): auth / parked-work banners are the
// most important thing a field user must see, then offline/sync status, then
// informational notices. The pilot triage card depends on this ordering — a
// "can't sync" state must never be hidden behind an info banner.
export const BANNER_PRIORITY = {
  /** Auth expiry, parked/at-risk work, data-loss risk — must be seen first. */
  CRITICAL: 0,
  /** Offline / sync status. */
  OFFLINE: 10,
  /** Informational only. */
  INFO: 20,
} as const

export interface BannerDescriptor {
  id: string
  priority: number
  node: React.ReactNode
}

export function BannerStack({ banners }: { banners: BannerDescriptor[] }) {
  if (banners.length === 0) return null
  // Lowest priority number wins; ties resolve to the earlier array entry, so
  // callers order same-tier banners most-important-first.
  const top = banners.reduce((best, b) => (b.priority < best.priority ? b : best))
  return <>{top.node}</>
}
