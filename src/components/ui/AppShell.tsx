'use client'

import * as React from 'react'
import {
  Box, Drawer, AppBar, Toolbar, Typography, IconButton,
  Tooltip, Badge, CircularProgress, useTheme, useMediaQuery,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import WifiOffIcon from '@mui/icons-material/WifiOff'
import CloudSyncIcon from '@mui/icons-material/CloudSync'
import AgricultureIcon from '@mui/icons-material/Agriculture'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { ServiceWorkerUpdater } from '@/components/shared/ServiceWorkerUpdater'

const DRAWER_WIDTH = 240

interface AppShellProps {
  nav: React.ReactNode
  children: React.ReactNode
  title?: string
  /** Optional header controls (e.g. the admin notification bell), shown left of the sync indicator. */
  headerActions?: React.ReactNode
  /** Optional mobile bottom tab bar (operator shell). Rendered only on mobile. */
  bottomNav?: React.ReactNode
  /** CC-23: full-bleed banner slot below the AppBar (e.g. the collapse-to-one OfflineBanner). */
  banner?: React.ReactNode
  /**
   * UXP-1c (records D32): which viewports get the mobile (bottom-nav) shell.
   * - `'admin'` (default): width `down('md')` — the historical desktop-vs-mobile split,
   *   unchanged for the admin app.
   * - `'device'`: device CLASS — a coarse pointer OR width `down('lg')` — so a phone in
   *   landscape (Pro Max 932px, Plus 926px) never silently swaps to the desktop shell.
   *   The operator app passes this. ONE heuristic governs the shell (and there is no
   *   separate mobile-keyed typography breakpoint in the operator surfaces to diverge
   *   from — grep-verified).
   */
  shellMode?: 'admin' | 'device'
}

export function AppShell({ nav, children, title = 'AHITS', headerActions, bottomNav, banner, shellMode = 'admin' }: AppShellProps) {
  const theme = useTheme()
  // All three run unconditionally (hook rule); `shellMode` selects which combination
  // decides "mobile". Admin keeps the exact md split it always had.
  const isNarrowMd = useMediaQuery(theme.breakpoints.down('md'))
  const isNarrowLg = useMediaQuery(theme.breakpoints.down('lg'))
  const isCoarsePointer = useMediaQuery('(pointer: coarse)')
  const isMobile = shellMode === 'device' ? (isCoarsePointer || isNarrowLg) : isNarrowMd
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const { pending, isOffline, syncing } = useOfflineQueue()

  React.useEffect(() => setMounted(true), [])

  // UXP-1d: render the MOBILE composition pre-mount (bottom nav present, temporary
  // drawer, no permanent 240px drawer). This both (a) stops phones flashing/fossilizing
  // the desktop shell on cold loads and JS-blocked/failed hydration (review §1.3), and
  // (b) keeps hydration safe: the server always renders with `mounted === false`, and so
  // does the first client render, so both produce the mobile frame — they MATCH (no
  // React #418). Desktop then upgrades to the permanent-drawer shell after mount; that
  // is a client-only transition, not a hydration mismatch. (Previously this defaulted to
  // desktop, which is why a 390px phone rendered a 240px permanent drawer until JS ran.)
  const effectiveIsMobile = mounted ? isMobile : true

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar sx={{ bgcolor: 'primary.main', color: 'white' }}>
        <AgricultureIcon sx={{ mr: 1 }} />
        <Typography variant="h6" noWrap>AHITS</Typography>
      </Toolbar>
      {nav}
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: theme.zIndex.drawer + 1,
          // UR-008: with viewport-fit=cover + a translucent iOS status bar, the
          // bar must clear the notch / Dynamic Island and the landscape insets.
          pt: 'env(safe-area-inset-top, 0px)',
          pl: 'env(safe-area-inset-left, 0px)',
          pr: 'env(safe-area-inset-right, 0px)',
        }}
      >
        <Toolbar>
          {effectiveIsMobile && (
            <IconButton color="inherit" edge="start" onClick={() => setDrawerOpen(true)} sx={{ mr: 2 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>{title}</Typography>
          {headerActions}
          {mounted && (isOffline ? (
            <Tooltip title={`Offline — ${pending} action(s) queued`}>
              <Badge badgeContent={pending || undefined} color="warning">
                <WifiOffIcon />
              </Badge>
            </Tooltip>
          ) : syncing ? (
            <Tooltip title={`Syncing ${pending} action(s)…`}>
              <CircularProgress size={20} color="inherit" />
            </Tooltip>
          ) : pending > 0 ? (
            <Tooltip title={`${pending} action(s) waiting to sync`}>
              <Badge badgeContent={pending} color="info">
                <CloudSyncIcon />
              </Badge>
            </Tooltip>
          ) : null)}
        </Toolbar>
      </AppBar>

      {/* Desktop permanent drawer */}
      {!effectiveIsMobile && (
        <Drawer variant="permanent" sx={{ width: DRAWER_WIDTH, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}>
          {drawer}
        </Drawer>
      )}

      {/* Mobile temporary drawer */}
      {effectiveIsMobile && (
        <Drawer variant="temporary" open={drawerOpen} onClose={() => setDrawerOpen(false)}
          sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}>
          {drawer}
        </Drawer>
      )}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          // UR-008: clear the (now inset-padded) fixed AppBar at the top and the
          // iOS home indicator at the bottom; respect landscape side insets.
          mt: 'calc(64px + env(safe-area-inset-top, 0px))',
          // Extra bottom space when the mobile tab bar is present so content
          // isn't hidden behind it (the bar carries its own safe-area inset).
          pb: effectiveIsMobile && bottomNav
            ? 'calc(80px + env(safe-area-inset-bottom, 0px))'
            : 'calc(24px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* CC-23: full-bleed banner slot — spans the content column edge-to-edge
            (no horizontal padding) so a collapsed OfflineBanner reads as a true
            page-width banner, not an inset card. */}
        {banner}
        {/* Content keeps the previous top + insets-aware side padding. Bottom
            clearance stays on the outer main (it owns the bottom-nav / home-
            indicator inset) — no pb here, or every page double-pads. */}
        <Box
          sx={{
            pt: 3,
            pl: 'calc(24px + env(safe-area-inset-left, 0px))',
            pr: 'calc(24px + env(safe-area-inset-right, 0px))',
          }}
        >
          {children}
        </Box>
      </Box>
      {effectiveIsMobile && bottomNav}
      <ServiceWorkerUpdater />
    </Box>
  )
}
