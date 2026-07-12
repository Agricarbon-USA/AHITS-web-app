'use client'

import * as React from 'react'
import { formatDate } from '@/lib/utils'
import {
  Grid, Typography, Box, List, ListItem, ListItemText, Button,
  Chip, CircularProgress, Divider, Alert, Paper, Stack,
} from '@mui/material'
import { StatCard } from '@/components/ui/StatCard'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import BuildIcon from '@mui/icons-material/Build'
import InventoryIcon from '@mui/icons-material/Inventory'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/shared/useToast'
import { alertLabel, alertLink } from '@/lib/alert-display'
import { useCanEdit, MutationButton } from '@/components/shared/ReadOnly'
import type { DashboardStats } from '@/types'

interface AlertRow {
  id: string
  type: string
  triggeredAt: string
  sourceTable: string | null
  sourceId: string | null
  metadata: Record<string, string | number | boolean | null> | null
}

interface Feeds {
  counts: { missedChecks: number; maintenanceDueSoon: number; longRunning: number; maintenanceWatch?: number }
  missedChecks: { rigId: string; operator: string; label: string | null; startedAt: string }[]
  maintenanceDueSoon: { id: string; taskName: string; target: string; nextDue: string | null; status: string; overdue: boolean }[]
  longRunning: { rigId: string; operator: string; label: string | null; startedAt: string; daysOut: number }[]
  recentActivity: { id: string; action: string; item: string; unit: string | null; operator: string | null; at: string }[]
  maintenanceWatch?: { name: string; href: string; spend: number; events: number; windowDays: number }[]
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const fmtDate = (iso: string | null) => formatDate(iso)

export default function AdminDashboardPage() {
  const canEdit = useCanEdit()
  const [stats, setStats] = React.useState<DashboardStats | null>(null)
  const [statsLoading, setStatsLoading] = React.useState(true)
  const [alerts, setAlerts] = React.useState<AlertRow[]>([])
  const [alertsLoading, setAlertsLoading] = React.useState(true)
  const [feeds, setFeeds] = React.useState<Feeds | null>(null)
  const [resolving, setResolving] = React.useState<string | null>(null)
  const router = useRouter()
  const showToast = useToast()
  const alertsRef = React.useRef<HTMLDivElement>(null)

  const loadAlerts = React.useCallback(() => {
    setAlertsLoading(true)
    fetch('/api/admin/alerts')
      .then((r) => r.json())
      .then((d) => setAlerts(d.data ?? []))
      .catch(() => showToast({ message: 'Could not load alerts.', severity: 'error' }))
      .finally(() => setAlertsLoading(false))
  }, [showToast])

  React.useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json() })
      .then((d) => setStats(d.data))
      .catch(() => showToast({ message: 'Could not load dashboard stats.', severity: 'error' }))
      .finally(() => setStatsLoading(false))
    fetch('/api/dashboard/feeds')
      .then((r) => r.json())
      .then((d) => setFeeds(d.data))
      .catch(() => { /* feeds are supplementary — fail quietly */ })
    loadAlerts()
  }, [loadAlerts, showToast])

  const handleResolve = async (alertId: string) => {
    setResolving(alertId)
    try {
      const res = await fetch(`/api/admin/alerts/${alertId}/resolve`, { method: 'POST' })
      if (!res.ok) throw new Error()
      loadAlerts()
    } catch {
      showToast({ message: 'Could not resolve the alert. Please try again.', severity: 'error' })
    } finally {
      setResolving(null)
    }
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} mb={2}>
        <Typography variant="h5">Overview</Typography>
        {!canEdit && <Chip size="small" label="View only" variant="outlined" />}
      </Stack>

      {/* Pinned red-alert banner — surfaces unresolved alerts above the fold. */}
      {!alertsLoading && alerts.length > 0 && (
        <Alert
          severity="error"
          variant="filled"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={() => alertsRef.current?.scrollIntoView({ behavior: 'smooth' })}>
              View
            </Button>
          }
        >
          {alerts.length} open alert{alerts.length > 1 ? 's' : ''} need{alerts.length > 1 ? '' : 's'} attention.
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Active Deployments" value={stats?.activeDeployments} icon={LocalShippingIcon} loading={statsLoading} href="/admin/deployments" subtitle="View all →" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Active Vehicles" value={stats?.vehiclesActive} icon={DirectionsCarIcon} loading={statsLoading} href="/admin/vehicles" subtitle="View all →" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="In Maintenance" value={stats?.vehiclesInMaintenance} icon={BuildIcon} color="warning.main" loading={statsLoading} href="/admin/vehicles" subtitle="View all →" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Items Checked Out" value={stats?.itemsCheckedOut} icon={InventoryIcon} loading={statsLoading} href="/admin/deployments" subtitle="View all →" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Overdue Maintenance" value={stats?.overdueMaintenanceCount} icon={BuildIcon} color="error.main" loading={statsLoading} href="/admin/maintenance" subtitle="View all →" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Open Alerts" value={stats?.pendingAlertsCount} icon={NotificationsActiveIcon} color="error.main" loading={statsLoading} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Today's Checks" value={stats?.todayChecksSubmitted} icon={CheckCircleIcon} color="success.main" loading={statsLoading} />
        </Grid>
      </Grid>

      {/* Operational feeds */}
      <Grid container spacing={3} mt={0.5}>
        <Grid item xs={12} md={6}>
          <FeedPanel title="Missed checks today" count={feeds?.missedChecks.length} emptyText="All active operators have checked in today.">
            {feeds?.missedChecks.map((m) => (
              <FeedItem key={m.rigId} primary={m.operator} secondary={`${m.label ? m.label + ' · ' : ''}deployed ${fmtDate(m.startedAt)}`} onClick={() => router.push('/admin/deployments')} />
            ))}
          </FeedPanel>
        </Grid>
        <Grid item xs={12} md={6}>
          <FeedPanel title="Maintenance due ≤14 days" count={feeds?.maintenanceDueSoon.length} emptyText="Nothing due in the next two weeks.">
            {feeds?.maintenanceDueSoon.map((t) => (
              <FeedItem
                key={t.id}
                primary={t.taskName}
                secondary={`${t.target} · due ${fmtDate(t.nextDue)}`}
                chip={t.overdue ? { label: 'Overdue', color: 'error' } : { label: 'Due soon', color: 'warning' }}
                onClick={() => router.push(`/admin/maintenance?task=${t.id}`)}
              />
            ))}
          </FeedPanel>
        </Grid>
        <Grid item xs={12} md={6}>
          <FeedPanel title="Long-running deployments (30d+)" count={feeds?.longRunning.length} emptyText="No deployments older than 30 days.">
            {feeds?.longRunning.map((r) => (
              <FeedItem key={r.rigId} primary={r.operator} secondary={`${r.label ? r.label + ' · ' : ''}${r.daysOut} days out`} chip={{ label: `${r.daysOut}d`, color: 'warning' }} onClick={() => router.push('/admin/deployments')} />
            ))}
          </FeedPanel>
        </Grid>
        <Grid item xs={12} md={6}>
          <FeedPanel title="Maintenance watch (90-day spend)" count={feeds?.maintenanceWatch?.length} emptyText="No maintenance spend recorded in the last 90 days.">
            {feeds?.maintenanceWatch?.map((m) => (
              <FeedItem
                key={m.href + m.name}
                primary={m.name}
                secondary={`${m.events} event${m.events !== 1 ? 's' : ''} · last ${m.windowDays} days`}
                chip={{ label: `$${m.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: 'warning' }}
                onClick={() => router.push(m.href)}
              />
            ))}
          </FeedPanel>
        </Grid>
        <Grid item xs={12} md={6}>
          <FeedPanel title="Recent activity" count={feeds?.recentActivity.length} emptyText="No recent check-in/out activity.">
            {feeds?.recentActivity.map((l) => (
              <FeedItem
                key={l.id}
                primary={`${l.action.replace(/_/g, ' ')} · ${l.item}${l.unit ? ` (${l.unit})` : ''}`}
                secondary={`${l.operator ?? 'Unknown'} · ${relativeTime(l.at)}`}
              />
            ))}
          </FeedPanel>
        </Grid>
      </Grid>

      <Box mt={4} ref={alertsRef}>
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
                meta.operatorName ? `Operator: ${meta.operatorName}` : null,
                meta.name ? `User: ${meta.name}` : null,
              ].filter(Boolean).join(' · ')
              return (
                <Box key={alert.id}>
                  {idx > 0 && <Divider />}
                  <ListItem
                    secondaryAction={
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {alertLink(alert.sourceTable, alert.sourceId, alert.type) && (
                          <Button size="small" onClick={() => router.push(alertLink(alert.sourceTable, alert.sourceId, alert.type)!)}>
                            View
                          </Button>
                        )}
                        <MutationButton
                          size="small"
                          onClick={() => handleResolve(alert.id)}
                          disabled={resolving === alert.id}
                          startIcon={resolving === alert.id ? <CircularProgress size={12} /> : null}
                        >
                          Resolve
                        </MutationButton>
                      </Box>
                    }
                  >
                    <ListItemText
                      primary={
                        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip label={alertLabel(alert.type)} size="small" color="error" variant="outlined" />
                          {meta.isAdminHeld === true && (
                            // D3: distinguishes an admin-held rig's missed check from a
                            // payroll-eligible operator's — never conflate the two.
                            <Chip label="Admin-held" size="small" color="default" variant="outlined" />
                          )}
                          <Typography variant="caption" color="text.secondary">{relativeTime(alert.triggeredAt)}</Typography>
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

function FeedPanel({ title, count, emptyText, children }: {
  title: string
  count: number | undefined
  emptyText: string
  children: React.ReactNode
}) {
  const items = React.Children.toArray(children).filter(Boolean)
  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="subtitle2">{title}</Typography>
        {count != null && count > 0 && <Chip size="small" label={count} />}
      </Stack>
      {count == null ? (
        <CircularProgress size={20} />
      ) : items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{emptyText}</Typography>
      ) : (
        <Stack divider={<Divider />}>{items}</Stack>
      )}
    </Paper>
  )
}

function FeedItem({ primary, secondary, chip, onClick }: {
  primary: string
  secondary?: string
  chip?: { label: string; color: 'warning' | 'error' | 'default' | 'success' }
  onClick?: () => void
}) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      spacing={1}
      onClick={onClick}
      sx={{ py: 0.75, cursor: onClick ? 'pointer' : 'default', '&:hover': onClick ? { bgcolor: 'action.hover' } : undefined, borderRadius: 1, px: onClick ? 0.5 : 0 }}
    >
      <Box flexGrow={1} minWidth={0}>
        <Typography variant="body2" noWrap>{primary}</Typography>
        {secondary && <Typography variant="caption" color="text.secondary" noWrap display="block">{secondary}</Typography>}
      </Box>
      {chip && <Chip size="small" label={chip.label} color={chip.color} variant="outlined" />}
    </Stack>
  )
}
