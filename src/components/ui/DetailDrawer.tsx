'use client'

import * as React from 'react'
import { Drawer } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { useHistoryGuard } from '@/hooks/useHistoryGuard'

// CC-23: the one right-anchored detail drawer. Owns the responsive
// `{ xs: '100%', sm: width }` sizing (full-width on mobile so nothing clips)
// plus the anchor and close behavior that the five admin drawers previously
// hand-rolled identically. `width` defaults to 480 but is per-drawer — the
// richer drawers (deployments 560, inventory 540) pass their own so adopting
// this primitive is a consolidation, not a visual change. `paperSx` carries
// each drawer's existing content padding so visuals stay identical.
export interface DetailDrawerProps {
  open: boolean
  onClose: () => void
  /** sm+ panel width in px. Mobile (xs) is always full-width. Default 480. */
  width?: number
  /** Extra sx merged onto the Drawer Paper (e.g. content padding). */
  paperSx?: SxProps<Theme>
  children: React.ReactNode
}

export function DetailDrawer({ open, onClose, width = 480, paperSx, children }: DetailDrawerProps) {
  // UXP-1e: hardware/browser Back closes the drawer instead of leaving the page.
  useHistoryGuard(open, onClose)
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: width }, ...paperSx } }}
    >
      {children}
    </Drawer>
  )
}
