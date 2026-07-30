'use client'

import * as React from 'react'
import { Paper, BottomNavigation, BottomNavigationAction, Badge } from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import ChecklistIcon from '@mui/icons-material/Checklist'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import { usePathname, useRouter } from 'next/navigation'
import { useIncomingPendingCount } from '@/hooks/useIncomingPendingCount'

// UR-008: thumb-reachable bottom tab bar for the operator's primary actions on mobile
// (the hamburger drawer still holds the full nav incl. read-only browse).
// CC-14: Requests added here (was drawer-only), and the pending transfer/handoff badge
// moved onto the My Deployment tab (was drawer-only) — that's where Accept/Decline live.
//
// UXP-1a (records D30, supersedes D28): back to FIVE tabs — Map is demoted to the
// drawer (still reachable at /operator/map via OperatorNav's "Crew Map" entry). D28's
// six-tab premise ("≈65px each at 390px, within showLabels spec") was false as
// implemented: MUI hardcodes min-width:80px per action, so six tabs = 480px content
// clipped equally on every phone (measured: at 390px both edge tabs ~35px, Home's
// label rendered "ne"), and the clipped edge tab was Home — the mechanism behind the
// "daily checkout only visible from home" report. The width override below is required
// even at five tabs (5 × 80px = 400px > 390px). **If a sixth tab is ever proposed,
// re-open D30 first — the OperatorBottomNav test snapshots this array and fails loudly.**
const ITEMS = [
  { label: 'Home', href: '/operator/dashboard', icon: <DashboardIcon /> },
  { label: 'Check', href: '/operator/daily-check', icon: <ChecklistIcon /> },
  { label: 'My Deployment', href: '/operator/my-deployment', icon: <LocalShippingIcon />, badge: true },
  { label: 'Requests', href: '/operator/requests', icon: <PlaylistAddCheckIcon /> },
  { label: 'Scan', href: '/operator/scan', icon: <QrCodeScannerIcon /> },
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
        // UXP-1a: defeat MUI's hardcoded min-width:80px per action so five tabs fit
        // inside 320–430px portrait widths (5 × 80 = 400px would otherwise clip both
        // edges below 400px). Height/label rules are untouched, so each hit target
        // stays ≥44px tall.
        sx={{ '& .MuiBottomNavigationAction-root': { minWidth: 0, px: 0.5 } }}
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
