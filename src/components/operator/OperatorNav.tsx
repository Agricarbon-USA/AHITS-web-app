'use client'

import * as React from 'react'
import { List, ListItemButton, ListItemIcon, ListItemText, Divider, Box, Typography, Button, Badge } from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import ChecklistIcon from '@mui/icons-material/Checklist'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import LockResetIcon from '@mui/icons-material/LockReset'
import LogoutIcon from '@mui/icons-material/Logout'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

const NAV_ITEMS = [
  { label: 'My Dashboard', href: '/operator/dashboard', icon: DashboardIcon },
  { label: 'Daily Check', href: '/operator/daily-check', icon: ChecklistIcon },
  { label: 'My Rig', href: '/operator/my-rig', icon: LocalShippingIcon },
  { label: 'Scan QR', href: '/operator/scan', icon: QrCodeScannerIcon },
]

export function OperatorNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { logout, user } = useAuth()
  const [pendingTransfers, setPendingTransfers] = React.useState(0)

  // Poll incoming pending transfers so the My Rig item carries a live badge —
  // operators previously only learned of transfers by opening My Rig.
  React.useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const res = await fetch('/api/transfers?status=PENDING&direction=incoming')
        if (!res.ok) return
        const d = await res.json()
        if (active) setPendingTransfers(Array.isArray(d) ? d.length : 0)
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
              {href === '/operator/my-rig' ? (
                <Badge badgeContent={pendingTransfers || undefined} color="error">
                  <Icon fontSize="small" />
                </Badge>
              ) : (
                <Icon fontSize="small" />
              )}
            </ListItemIcon>
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
