'use client'

import * as React from 'react'
import { Paper, BottomNavigation, BottomNavigationAction, Badge } from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import ChecklistIcon from '@mui/icons-material/Checklist'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import MapIcon from '@mui/icons-material/Map'
import { usePathname, useRouter } from 'next/navigation'
import { useIncomingPendingCount } from '@/hooks/useIncomingPendingCount'

// UR-008: thumb-reachable bottom tab bar for the operator's primary actions on mobile
// (the hamburger drawer still holds the full nav incl. read-only browse).
// CC-14: Requests added here (was drawer-only), and the pending transfer/handoff badge
// moved onto the My Deployment tab (was drawer-only) — that's where Accept/Decline live.
// CC-32 (3.1): Map added as a 6th tab — the pilot's marquee trust surface was
// drawer-only, so seeing where the crew last checked in cost a hamburger tap plus a
// drawer hunt every time. Tradeoff weighed and decided (Max ruled 2026-07-28): 6 tabs
// ≈ 65px each at 390px — tight, but within MUI BottomNavigation's showLabels spec and
// every label here is one short word. The alternative (swallowing Requests back into
// the drawer) would demote a surface CC-14 promoted for cause. No badge on Map.
const ITEMS = [
  { label: 'Home', href: '/operator/dashboard', icon: <DashboardIcon /> },
  { label: 'Check', href: '/operator/daily-check', icon: <ChecklistIcon /> },
  { label: 'My Deployment', href: '/operator/my-deployment', icon: <LocalShippingIcon />, badge: true },
  { label: 'Requests', href: '/operator/requests', icon: <PlaylistAddCheckIcon /> },
  { label: 'Scan', href: '/operator/scan', icon: <QrCodeScannerIcon /> },
  { label: 'Map', href: '/operator/map', icon: <MapIcon /> },
]

export function OperatorBottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const pendingCount = useIncomingPendingCount()
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
          <BottomNavigationAction
            key={i.href}
            label={i.label}
            icon={
              i.badge && pendingCount > 0
                ? <Badge badgeContent={pendingCount} color="error">{i.icon}</Badge>
                : i.icon
            }
          />
        ))}
      </BottomNavigation>
    </Paper>
  )
}
