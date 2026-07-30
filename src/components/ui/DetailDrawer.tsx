'use client'

import * as React from 'react'
import { Drawer, IconButton } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import type { SxProps, Theme } from '@mui/material/styles'

// CC-23: the one right-anchored detail drawer. Owns the responsive
// `{ xs: '100%', sm: width }` sizing (full-width on mobile so nothing clips)
// plus the anchor and close behavior that the five admin drawers previously
// hand-rolled identically. `width` defaults to 480 but is per-drawer — the
// richer drawers (deployments 560, inventory 540) pass their own so adopting
// this primitive is a consolidation, not a visual change. `paperSx` carries
// each drawer's existing content padding so visuals stay identical.
//
// UXP-1f (review §1.6): two structural fixes for all five adopters at once —
//  1. the Paper renders BELOW the fixed AppBar (top offset + reduced height)
//     instead of top:0 under the z=1201 bar, so the drawer header (operator
//     name / status chip) is never hidden;
//  2. a built-in 44px close X, so the two drawers that had NO close control on
//     phones (deployments/inventory) get one, and the two whose page-local X
//     hit-tested to the notification bell (vehicles/maintenance) drop theirs in
//     favour of this one — which sits inside the drawer, below the bar, and can
//     never resolve to the bell.
export interface DetailDrawerProps {
  open: boolean
  onClose: () => void
  /** sm+ panel width in px. Mobile (xs) is always full-width. Default 480. */
  width?: number
  /** Extra sx merged onto the Drawer Paper (e.g. content padding). */
  paperSx?: SxProps<Theme>
  children: React.ReactNode
}

// AppBar Toolbar heights (MUI default): 56px on xs-portrait, 64px on sm+. Match
// them plus the iOS safe-area top inset so the Paper starts exactly under the bar.
const TOP_XS = 'calc(56px + env(safe-area-inset-top, 0px))'
const TOP_SM = 'calc(64px + env(safe-area-inset-top, 0px))'
const HEIGHT_XS = 'calc(100% - 56px - env(safe-area-inset-top, 0px))'
const HEIGHT_SM = 'calc(100% - 64px - env(safe-area-inset-top, 0px))'

export function DetailDrawer({ open, onClose, width = 480, paperSx, children }: DetailDrawerProps) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: width },
          // UXP-1f: sit below the AppBar so the drawer's own header is visible.
          top: { xs: TOP_XS, sm: TOP_SM },
          height: { xs: HEIGHT_XS, sm: HEIGHT_SM },
          ...paperSx,
        },
      }}
    >
      {/* Built-in close — 44px target, above content, resolves to itself. Absolute
          within the (position:fixed) Paper so it pins to the drawer's top-right
          regardless of each adopter's bespoke header. */}
      <IconButton
        aria-label="Close"
        onClick={onClose}
        sx={{
          position: 'absolute',
          top: 4,
          right: 4,
          zIndex: 2,
          width: 44,
          height: 44,
          bgcolor: 'background.paper',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <CloseIcon />
      </IconButton>
      {children}
    </Drawer>
  )
}
