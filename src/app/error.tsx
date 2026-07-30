'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { BoundaryScreen } from '@/components/ui/BoundaryScreen'

// UXP-1d: before this, an uncaught client render error unmounted to Next's bare
// default with no way back (review §1.3) — in an installed PWA there is no URL bar to
// escape with. This branded boundary gives two escapes. No Sentry call here: the
// server capture (onRequestError) + SentryProvider's client handlers already cover it.
//
// "Reload" does a hard reload rather than Next's reset(): the likeliest crash on a
// near-daily-deploying PWA is a stale JS chunk after a service-worker swap, which a
// soft reset() does NOT clear but a full reload does.
export default function AppError() {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith('/admin') ?? false
  const home = isAdmin
    ? { label: 'Dashboard', href: '/admin/dashboard' }
    : { label: 'Go to Home', href: '/operator/dashboard' }

  return (
    <BoundaryScreen
      title="Something went wrong"
      message="This screen hit an unexpected error. Your saved work isn’t affected — reload to try again, or head back."
      actions={[
        { label: 'Reload', primary: true, onClick: () => window.location.reload() },
        { label: home.label, onClick: () => { window.location.href = home.href } },
      ]}
    />
  )
}
