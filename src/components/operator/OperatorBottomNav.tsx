'use client'

import * as React from 'react'
import { Paper, BottomNavigation, BottomNavigationAction } from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import ChecklistIcon from '@mui/icons-material/Checklist'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import { usePathname, useRouter } from 'next/navigation'

// UR-008: thumb-reachable bottom tab bar for the operator's primary actions on
// mobile (the hamburger drawer still holds the full nav incl. read-only browse).
const ITEMS = [
  { label: 'Home', href: '/operator/dashboard', icon: <DashboardIcon /> },
  { label: 'Check', href: '/operator/daily-check', icon: <ChecklistIcon /> },
  { label: 'My Deployment', href: '/operator/my-deployment', icon: <LocalShippingIcon /> },
  { label: 'Scan', href: '/operator/scan', icon: <QrCodeScannerIcon /> },
]

export function OperatorBottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const active = ITEMS.findIndex((i) => pathname.startsWith(i.href))

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: (t) => t.zIndex.appBar,
        // Keep the tab labels above the iOS home indicator.
        pb: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <BottomNavigation
        showLabels
        value={active === -1 ? false : active}
        onChange={(_, i) => router.push(ITEMS[i].href)}
      >
        {ITEMS.map((i) => (
          <BottomNavigationAction key={i.href} label={i.label} icon={i.icon} />
        ))}
      </BottomNavigation>
    </Paper>
  )
}
