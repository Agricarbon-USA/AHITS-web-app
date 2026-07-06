'use client'

import * as React from 'react'
import { List, ListItemButton, ListItemIcon, ListItemText, Divider, Box, Typography, Button, Badge } from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import ChecklistIcon from '@mui/icons-material/Checklist'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import InventoryIcon from '@mui/icons-material/Inventory'
import BuildIcon from '@mui/icons-material/Build'
import WarehouseIcon from '@mui/icons-material/Warehouse'
import FolderIcon from '@mui/icons-material/Folder'
import LockResetIcon from '@mui/icons-material/LockReset'
import LogoutIcon from '@mui/icons-material/Logout'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

const NAV_ITEMS = [
  { label: 'My Dashboard', href: '/operator/dashboard', icon: DashboardIcon },
  { label: 'Daily Check', href: '/operator/daily-check', icon: ChecklistIcon },
  { label: 'My Deployment', href: '/operator/my-deployment', icon: LocalShippingIcon },
  { label: 'Scan QR', href: '/operator/scan', icon: QrCodeScannerIcon },
  { label: 'Requests', href: '/operator/requests', icon: PlaylistAddCheckIcon },
]

// Read-only org-wide views (workplan §6). Keep in lockstep with
// OPERATOR_VIEW_ADMIN_PATHS in proxy.ts + OPERATOR_VIEW_HREFS in AdminNav.tsx.
// These render the same admin page components in a read-only (canEdit=false)
// context — one source of truth, no duplicate screens.
const VIEW_ITEMS = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: DashboardIcon },
  { label: 'Inventory', href: '/admin/inventory', icon: InventoryIcon },
  { label: 'Deployments', href: '/admin/deployments', icon: LocalShippingIcon },
  { label: 'Maintenance', href: '/admin/maintenance', icon: BuildIcon },
  { label: 'Hubs', href: '/admin/hubs', icon: WarehouseIcon },
  { label: 'Projects', href: '/admin/projects', icon: FolderIcon },
  { label: 'Vehicles', href: '/admin/vehicles', icon: DirectionsCarIcon },
]

export function OperatorNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { logout, user } = useAuth()
  const [pendingCount, setPendingCount] = React.useState(0)

  // Poll incoming pending transfers + handoffs so the My Rig item carries a live badge.
  React.useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [tRes, hRes] = await Promise.all([
          fetch('/api/transfers?status=PENDING&direction=incoming'),
          fetch('/api/handoffs?status=PENDING&direction=incoming'),
        ])
        const transfers = tRes.ok ? await tRes.json() : []
        const handoffs = hRes.ok ? await hRes.json() : []
        if (active) setPendingCount((Array.isArray(transfers) ? transfers.length : 0) + (Array.isArray(handoffs) ? handoffs.length : 0))
      } catch {
        /* offline / transient — keep last known count */
      }
    }
    load()
    const t = window.setInterval(load, 45_000)
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { active = false; window.clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [])

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
            <ListItemIcon sx={{ minWidth: 36 }}>
              {href === '/operator/my-deployment' ? (
                <Badge badgeContent={pendingCount || undefined} color="error">
                  <Icon fontSize="small" />
                </Badge>
              ) : (
                <Icon fontSize="small" />
              )}
            </ListItemIcon>
            <ListItemText primary={label} primaryTypographyProps={{ fontSize: 14, fontWeight: pathname.startsWith(href) ? 600 : 400 }} />
          </ListItemButton>
        ))}
        <Divider sx={{ my: 1 }} />
        <Typography variant="caption" color="text.secondary" sx={{ px: 2.5, py: 0.5, display: 'block' }}>Browse (view only)</Typography>
        {VIEW_ITEMS.map(({ label, href, icon: Icon }) => (
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
        <Button
          startIcon={<LockResetIcon />}
          onClick={() => router.push('/operator/change-pin')}
          fullWidth
          size="small"
          color="inherit"
          sx={{ justifyContent: 'flex-start', mb: 0.5 }}
        >
          Change PIN
        </Button>
        <Button startIcon={<LogoutIcon />} onClick={logout} fullWidth size="small" color="inherit" sx={{ justifyContent: 'flex-start' }}>Sign out</Button>
      </Box>
    </Box>
  )
}
