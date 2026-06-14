'use client'

import * as React from 'react'
import { Grid, Typography, Box } from '@mui/material'
import { StatCard } from '@/components/ui/StatCard'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import BuildIcon from '@mui/icons-material/Build'
import InventoryIcon from '@mui/icons-material/Inventory'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import type { DashboardStats } from '@/types'

export default function AdminDashboardPage() {
  const [stats, setStats] = React.useState<DashboardStats | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((d) => setStats(d.data))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Box>
      <Typography variant="h5" mb={3}>Overview</Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Active Vehicles" value={stats?.vehiclesActive} icon={DirectionsCarIcon} loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="In Maintenance" value={stats?.vehiclesInMaintenance} icon={BuildIcon} color="warning.main" loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Items Checked Out" value={stats?.itemsCheckedOut} icon={InventoryIcon} loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Overdue Maintenance" value={stats?.overdueMaintenanceCount} icon={BuildIcon} color="error.main" loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Open Alerts" value={stats?.pendingAlertsCount} icon={NotificationsActiveIcon} color="error.main" loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Today's Checks" value={stats?.todayChecksSubmitted} icon={CheckCircleIcon} color="success.main" loading={loading} />
        </Grid>
      </Grid>
    </Box>
  )
}
