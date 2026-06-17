'use client'

import * as React from 'react'
import { List, ListItemButton, ListItemIcon, ListItemText, Divider, Box, Typography, Button } from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import InventoryIcon from '@mui/icons-material/Inventory'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import BuildIcon from '@mui/icons-material/Build'
import FolderIcon from '@mui/icons-material/Folder'
import PeopleIcon from '@mui/icons-material/People'
import BarChartIcon from '@mui/icons-material/BarChart'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import SettingsIcon from '@mui/icons-material/Settings'
import LogoutIcon from '@mui/icons-material/Logout'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: DashboardIcon },
  { label: 'Inventory', href: '/admin/inventory', icon: InventoryIcon },
  { label: 'Deployments', href: '/admin/deployments', icon: LocalShippingIcon },
  { label: 'Vehicles', href: '/admin/vehicles', icon: DirectionsCarIcon },
  { label: 'Maintenance', href: '/admin/maintenance', icon: BuildIcon },
  { label: 'Projects', href: '/admin/projects', icon: FolderIcon },
  { label: 'Users', href: '/admin/users', icon: PeopleIcon },
  { label: 'Reports', href: '/admin/reports', icon: BarChartIcon },
  { label: 'Settings', href: '/admin/settings', icon: SettingsIcon },
]

export function AdminNav() {
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
