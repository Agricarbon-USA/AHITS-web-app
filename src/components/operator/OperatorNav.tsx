'use client'

import * as React from 'react'
import { List, ListItemButton, ListItemIcon, ListItemText, Divider, Box, Typography, Button } from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import ChecklistIcon from '@mui/icons-material/Checklist'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import InventoryIcon from '@mui/icons-material/Inventory'
import LogoutIcon from '@mui/icons-material/Logout'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

const NAV_ITEMS = [
  { label: 'My Dashboard', href: '/operator/dashboard', icon: DashboardIcon },
  { label: 'Equipment', href: '/operator/inventory', icon: InventoryIcon },
  { label: 'Daily Check', href: '/operator/daily-check', icon: ChecklistIcon },
  { label: 'Check Out / In', href: '/operator/checkout', icon: SwapHorizIcon },
  { label: 'Scan QR', href: '/operator/scan', icon: QrCodeScannerIcon },
]

export function OperatorNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { logout, user } = useAuth()

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <List sx={{ flexGrow: 1, pt: 1 }}>
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
          <ListItemButton
            key={href}
            selected={pathname.startsWith(href)}
            onClick={() => router.push(href)}
            sx={{ borderRadius: 2, mx: 1, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}><Icon fontSize="small" /></ListItemIcon>
            <ListItemText primary={label} primaryTypographyProps={{ fontSize: 14, fontWeight: pathname.startsWith(href) ? 600 : 400 }} />
          </ListItemButton>
        ))}
      </List>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary" display="block" mb={1}>{user?.name}</Typography>
        <Button startIcon={<LogoutIcon />} onClick={logout} fullWidth size="small" color="inherit">Sign out</Button>
      </Box>
    </Box>
  )
}
