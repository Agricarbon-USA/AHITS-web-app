'use client'

import * as React from 'react'
import {
  Grid, Typography, Box, Stack, Paper, Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, CircularProgress, Alert, Chip, Tooltip, LinearProgress,
} from '@mui/material'
import { StatCard } from '@/components/ui/StatCard'
import { StatusChip } from '@/components/shared/StatusChip'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import TimerIcon from '@mui/icons-material/Timer'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import { useRouter } from 'next/navigation'
import type { PilotMetrics, PilotDay, PilotCheckRow, BreakdownRig } from '@/lib/pilot-metrics'

// CC-31 item 6 (review §3.10 / §4.5): Max's daily 5-minute pilot watch, priced at zero
// clicks before this page existed. Adoption + avg check time + GPS grant rate on screen;
// a per-day trend; the day's checks with the <20s "worth a look" flag (the charter's
// variance signal, framed as a prompt, never an accusation); each check deep-links to the
// CC-26 viewer (D12: /admin/vehicles?check=<id>); and the per-rig operator+vehicle grid.
// Read-only, observational — GPS grant rate is a coaching signal, never a target (D2).

function pct(x: number | null): string {
  return x == null ? '—' : `${Math.round(x * 100)}%`
}
function fmtDuration(ms: number | null): string {
  if (ms == null) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}
function fmtTime(iso: string | Date | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function AdminPilotPage() {
  const [data, setData] = React.useState<PilotMetrics | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null)
  const router = useRouter()

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/admin/pilot-metrics')
        if (!res.ok) throw new Error(res.status === 403 ? 'Admins only.' : 'Could not load pilot metrics.')
        const json = (await res.json()) as { data: PilotMetrics }
        if (cancelled) return
        setData(json.data)
        setSelectedDate(json.data.to)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load pilot metrics.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const days = data?.days ?? []
  const latest: PilotDay | undefined = days[days.length - 1]
  const selected: PilotDay | undefined = selectedDate ? days.find((d) => d.date === selectedDate) : latest
  const breakdown: BreakdownRig[] = data?.breakdown.rigs ?? []
  const breakdownDay = data?.breakdown.day

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress /></Box>
  }
  if (error) return <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
  if (!data) return null

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Pilot</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        {data.from} → {data.to} · observational — a coaching read, not a scorecard.
      </Typography>

      {/* Headline tiles for the most recent day */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={4}>
          <StatCard
            title={`Adoption (${latest?.date ?? '—'})`}
            value={pct(latest?.adoptionRate ?? null)}
            subtitle={latest ? `${latest.checkedVehicles} / ${latest.eligibleVehicles} eligible vehicles checked` : undefined}
            icon={FactCheckIcon}
            color="primary.main"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard
            title="Avg check time"
            value={fmtDuration(latest?.avgDurationMs ?? null)}
            subtitle={latest ? `${latest.durationSampleSize} timed check(s)` : undefined}
            icon={TimerIcon}
            color="info.main"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard
            title="GPS grant rate"
            value={pct(latest?.gpsGrantRate ?? null)}
            subtitle={latest ? `${latest.gpsSampleSize} check(s) — a coaching signal, not a target` : undefined}
            icon={MyLocationIcon}
            color="success.main"
          />
        </Grid>
      </Grid>

      {/* Per-day trend — click a day to drill into its checks */}
      <Paper sx={{ mb: 3 }}>
        <Typography variant="subtitle1" sx={{ p: 2, pb: 1 }}>Daily trend</Typography>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Day</TableCell>
                <TableCell>Adoption</TableCell>
                <TableCell align="right">Checked / eligible</TableCell>
                <TableCell align="right">Avg time</TableCell>
                <TableCell align="right">GPS</TableCell>
                <TableCell align="right">Checks</TableCell>
                <TableCell align="right">&lt;20s</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {days.map((d) => (
                <TableRow
                  key={d.date}
                  hover
                  selected={d.date === selectedDate}
                  onClick={() => setSelectedDate(d.date)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{d.date}</TableCell>
                  <TableCell sx={{ minWidth: 120 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box sx={{ width: 56 }}>
                        <LinearProgress
                          variant="determinate"
                          value={Math.round((d.adoptionRate ?? 0) * 100)}
                          sx={{ height: 6, borderRadius: 3 }}
                        />
                      </Box>
                      <Typography variant="caption">{pct(d.adoptionRate)}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell align="right">{d.checkedVehicles} / {d.eligibleVehicles}</TableCell>
                  <TableCell align="right">{fmtDuration(d.avgDurationMs)}</TableCell>
                  <TableCell align="right">{pct(d.gpsGrantRate)}</TableCell>
                  <TableCell align="right">{d.checks.length}</TableCell>
                  <TableCell align="right">
                    {d.flaggedFastCount > 0
                      ? <StatusChip label={String(d.flaggedFastCount)} color="warning" />
                      : <Typography variant="caption" color="text.secondary">0</Typography>}
                  </TableCell>
                </TableRow>
              ))}
              {days.length === 0 && (
                <TableRow><TableCell colSpan={7}><Typography variant="body2" color="text.secondary">No days in range.</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Selected day's checks — the drill-down. Each row opens the CC-26 viewer. */}
      <Paper sx={{ mb: 3 }}>
        <Typography variant="subtitle1" sx={{ p: 2, pb: 1 }}>
          Checks · {selected?.date ?? '—'}
        </Typography>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Operator</TableCell>
                <TableCell>Vehicle</TableCell>
                <TableCell>Submitted</TableCell>
                <TableCell align="right">Time</TableCell>
                <TableCell>Result</TableCell>
                <TableCell>GPS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(selected?.checks ?? []).map((c: PilotCheckRow) => {
                const fast = c.durationMs != null && c.durationMs < 20_000
                return (
                  <TableRow key={c.id} hover onClick={() => router.push(`/admin/vehicles?check=${c.id}`)} sx={{ cursor: 'pointer' }}>
                    <TableCell>{c.operatorName ?? '—'}</TableCell>
                    <TableCell>{c.vehicleName ?? '—'}</TableCell>
                    <TableCell>{fmtTime(c.submittedAt)}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                        <span>{fmtDuration(c.durationMs)}</span>
                        {fast && (
                          <Tooltip title="Fast check — worth a look">
                            <span><StatusChip label="<20s" color="warning" /></span>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell><StatusChip label={c.passFail ? 'Pass' : 'Fail'} color={c.passFail ? 'success' : 'error'} /></TableCell>
                    <TableCell>
                      {c.hasGps
                        ? <Chip size="small" label="GPS" color="success" variant="outlined" />
                        : <Typography variant="caption" color="text.secondary">none</Typography>}
                    </TableCell>
                  </TableRow>
                )
              })}
              {(selected?.checks?.length ?? 0) === 0 && (
                <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">No checks on this day.</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Per-rig operator + vehicle coverage grid for the most recent day. */}
      <Paper>
        <Typography variant="subtitle1" sx={{ p: 2, pb: 1 }}>
          Coverage by rig · {breakdownDay ?? '—'}
        </Typography>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Operator</TableCell>
                <TableCell>Project</TableCell>
                <TableCell align="right">Done / due</TableCell>
                <TableCell>Vehicles</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {breakdown.map((r) => (
                <TableRow key={r.rigId}>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <span>{r.operatorName ?? '—'}</span>
                      {r.isAdminHeld && <StatusChip label="Admin-held" color="default" />}
                    </Stack>
                  </TableCell>
                  <TableCell>{r.projectName ?? '—'}</TableCell>
                  <TableCell align="right">{r.checkedCount} / {r.eligibleCount}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {r.vehicles.map((v) => (
                        <StatusChip key={v.vehicleId} label={v.name ?? '—'} color={v.checked ? 'success' : 'default'} variant={v.checked ? 'filled' : 'outlined'} />
                      ))}
                      {r.vehicles.length === 0 && <Typography variant="caption" color="text.secondary">no vehicles</Typography>}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {breakdown.length === 0 && (
                <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.secondary">No active rigs on this day.</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  )
}
