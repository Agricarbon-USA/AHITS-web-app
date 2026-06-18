'use client'

import * as React from 'react'
import {
  Grid, Typography, Box, List, ListItem, ListItemText, Button,
  Chip, CircularProgress, Divider,
} from '@mui/material'
import { StatCard } from '@/components/ui/StatCard'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import BuildIcon from '@mui/icons-material/Build'
import InventoryIcon from '@mui/icons-material/Inventory'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import type { DashboardStats } from '@/types'

interface AlertRow {
  id: string
  type: string
  triggeredAt: string
  sourceTable: string | null
  sourceId: string | null
  metadata: Record<string, string | number | boolean | null> | null
}

const ALERT_LABELS: Record<string, string> = {
  DAMAGE_REPORTED: 'Damage Reported',
  EQUIPMENT_NOT_RETURNED: 'Equipment Not Returned',
  MAINTENANCE_OVERDUE: 'Maintenance Overdue',
  REPAIR_NEEDED: 'Repair Needed',
  LOW_INVENTORY: 'Low Inventory',
  INSURANCE_EXPIRING: 'Insurance Expiring',
  REGISTRATION_EXPIRING: 'Registration Expiring',
  PIN_LOCKED: 'PIN Locked',
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function AdminDashboardPage() {
  const [stats, setStats] = React.useState<DashboardStats | null>(null)
  const [statsLoading, setStatsLoading] = React.useState(true)
  const [alerts, setAlerts] = React.useState<AlertRow[]>([])
  const [alertsLoading, setAlertsLoading] = React.useState(true)
  const [resolving, setResolving] = React.useState<string | null>(null)

  const loadAlerts = React.useCallback(() => {
    setAlertsLoading(true)
    fetch('/api/admin/alerts')
      .then((r) => r.json())
      .then((d) => setAlerts(d.data ?? []))
      .finally(() => setAlertsLoading(false))
  }, [])

  React.useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((d) => setStats(d.data))
      .finally(() => setStatsLoading(false))
    loadAlerts()
  }, [loadAlerts])

  const handleResolve = async (alertId: string) => {
    setResolving(alertId)
    await fetch(`/api/admin/alerts/${alertId}/resolve`, { method: 'POST' })
    setResolving(null)
    loadAlerts()
  }

  return (
    <Box>
      <Typography variant="h5" mb={3}>Overview</Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Active Deployments" value={stats?.activeDeployments} icon={LocalShippingIcon} loading={statsLoading} href="/admin/deployments" subtitle="View all →" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Active Vehicles" value={stats?.vehiclesActive} icon={DirectionsCarIcon} loading={statsLoading} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="In Maintenance" value={stats?.vehiclesInMaintenance} icon={BuildIcon} color="warning.main" loading={statsLoading} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Items Checked Out" value={stats?.itemsCheckedOut} icon={InventoryIcon} loading={statsLoading} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Overdue Maintenance" value={stats?.overdueMaintenanceCount} icon={BuildIcon} color="error.main" loading={statsLoading} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Open Alerts" value={stats?.pendingAlertsCount} icon={NotificationsActiveIcon} color="error.main" loading={statsLoading} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Today's Checks" value={stats?.todayChecksSubmitted} icon={CheckCircleIcon} color="success.main" loading={statsLoading} />
        </Grid>
      </Grid>

      <Box mt={4}>
        <Typography variant="h6" mb={1}>Active Alerts</Typography>
        {alertsLoading ? (
          <CircularProgress size={24} />
        ) : alerts.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No unresolved alerts.</Typography>
        ) : (
          <List disablePadding sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
            {alerts.map((alert, idx) => {
              const meta = alert.metadata ?? {}
              const context = [
                meta.itemName ? String(meta.itemName) : null,
                meta.taskName ? String(meta.taskName) : null,
                meta.name ? `User: ${meta.name}` : null,
              ].filter(Boolean).join(' · ')
              return (
                <Box key={alert.id}>
                  {idx > 0 && <Divider />}
                  <ListItem
                    secondaryAction={
                      <Button
                        size="small"
                        onClick={() => handleResolve(alert.id)}
                        disabled={resolving === alert.id}
                        startIcon={resolving === alert.id ? <CircularProgress size={12} /> : null}
                      >
                        Resolve
                      </Button>
                    }
                  >
                    <ListItemText
                      primary={
                        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            label={ALERT_LABELS[alert.type] ?? alert.type}
                            size="small"
                            color="error"
                            variant="outlined"
                          />
                          <Typography variant="caption" color="text.secondary">
                            {relativeTime(alert.triggeredAt)}
                          </Typography>
                        </Box>
                      }
                      secondary={context || undefined}
                    />
                  </ListItem>
                </Box>
              )
            })}
          </List>
        )}
      </Box>
    </Box>
  )
}
