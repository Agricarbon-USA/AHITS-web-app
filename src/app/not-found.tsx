'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { BoundaryScreen } from '@/components/ui/BoundaryScreen'

// UXP-1d: `/operator/anything-stale` used to render an unbranded white "404" with no
// way back (review §1.3). This renders inside <Providers> (root layout) so it's
// branded, with working escapes. (A 404 embedded in the operator/admin shell chrome
// would need per-route-group not-found files; the root boundary already satisfies the
// acceptance — branded + working escapes — so those stay out of this PR's scope.)
export default function NotFound() {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith('/admin') ?? false
  const home = isAdmin
    ? { label: 'Dashboard', href: '/admin/dashboard' }
    : { label: 'Go to Home', href: '/operator/dashboard' }

  return (
    <BoundaryScreen
      title="Page not found"
      message="That page doesn’t exist or has moved. Use a button below to get back."
      actions={[
        { label: home.label, primary: true, onClick: () => { window.location.href = home.href } },
        { label: 'Reload', onClick: () => window.location.reload() },
      ]}
    />
  )
}
