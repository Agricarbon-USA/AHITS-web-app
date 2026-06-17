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

const DRAWER_WIDTH = 240

interface AppShellProps {
  nav: React.ReactNode
  children: React.ReactNode
  title?: string
}

export function AppShell({ nav, children, title = 'AHITS' }: AppShellProps) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const { pending, isOffline, syncing } = useOfflineQueue()

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
      <AppBar position="fixed" sx={{ zIndex: theme.zIndex.drawer + 1 }}>
        <Toolbar>
          {isMobile && (
            <IconButton color="inherit" edge="start" onClick={() => setDrawerOpen(true)} sx={{ mr: 2 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>{title}</Typography>
          {isOffline ? (
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
          ) : null}
        </Toolbar>
      </AppBar>

      {/* Desktop permanent drawer */}
      {!isMobile && (
        <Drawer variant="permanent" sx={{ width: DRAWER_WIDTH, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}>
          {drawer}
        </Drawer>
      )}

      {/* Mobile temporary drawer */}
      {isMobile && (
        <Drawer variant="temporary" open={drawerOpen} onClose={() => setDrawerOpen(false)}
          sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}>
          {drawer}
        </Drawer>
      )}

      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8, minWidth: 0 }}>
        {children}
      </Box>
    </Box>
  )
}
