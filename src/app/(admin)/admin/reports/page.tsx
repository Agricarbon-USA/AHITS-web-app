'use client'

import * as React from 'react'
import {
  Box, Typography, Paper, Stack, TextField, Button, CircularProgress, Chip,
  Table, TableHead, TableBody, TableRow, TableCell, TableSortLabel,
  ToggleButton, ToggleButtonGroup, TableContainer,
} from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import { StatusChip } from '@/components/shared/StatusChip'
import { useToast } from '@/components/shared/useToast'

interface ReportRow {
  assetType: 'VEHICLE' | 'UNIT'
  id: string
  name: string
  identifier: string | null
  kind: string
  status: string
  deployments: number
  daysDeployed: number
  utilizationPct: number
  maintenanceEvents: number
  maintenanceSpend: number
  downtimeDays: number
  isRental: boolean
  rentalCompany: string | null
  rentalCostBasis: string | null
  rentalCost: number
}

interface ReportSummary {
  windowDays: number
  from: string
  to: string
  assetCount: number
  totalMaintenanceSpend: number
  totalMaintenanceEvents: number
  avgUtilizationPct: number
  totalDowntimeDays: number
  rentalCount: number
  totalRentalCost: number
}

type SortKey = keyof Pick<ReportRow, 'name' | 'deployments' | 'daysDeployed' | 'utilizationPct' | 'maintenanceEvents' | 'maintenanceSpend' | 'downtimeDays' | 'rentalCost'>

const fmtDate = (d: Date) => d.toISOString().slice(0, 10)
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 160 }}>
      <Typography variant="caption" color="text.secondary" textTransform="uppercase" letterSpacing={0.5}>{label}</Typography>
      <Typography variant="h5" fontWeight={700} color={accent ? 'error.main' : 'text.primary'} mt={0.5}>{value}</Typography>
    </Paper>
  )
}

export default function AdminReportsPage() {
  const showToast = useToast()
  const today = React.useMemo(() => new Date(), [])
  const [from, setFrom] = React.useState(fmtDate(new Date(today.getTime() - 180 * 86_400_000)))
  const [to, setTo] = React.useState(fmtDate(today))
  const [assetFilter, setAssetFilter] = React.useState<'ALL' | 'VEHICLE' | 'UNIT' | 'RENTAL'>('ALL')
  const [rows, setRows] = React.useState<ReportRow[]>([])
  const [summary, setSummary] = React.useState<ReportSummary | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [sortKey, setSortKey] = React.useState<SortKey>('maintenanceSpend')
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc')

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/equipment?from=${from}&to=${to}`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Failed to load report', severity: 'error' })
        return
      }
      const d = await res.json()
      setRows(d.data.rows ?? [])
      setSummary(d.data.summary ?? null)
    } catch {
      showToast({ message: 'Failed to load report', severity: 'error' })
    } finally {
      setLoading(false)
    }
  }, [from, to, showToast])

  React.useEffect(() => { load() }, [load])

  const downloadCsv = async () => {
    try {
      const res = await fetch(`/api/reports/equipment?from=${from}&to=${to}&format=csv`)
      if (!res.ok) { showToast({ message: 'CSV export failed', severity: 'error' }); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `equipment-cost-utilization-${to}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      showToast({ message: 'CSV export failed', severity: 'error' })
    }
  }

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc') }
  }

  const visible = React.useMemo(() => {
    const filtered = assetFilter === 'ALL'
      ? rows
      : assetFilter === 'RENTAL'
        ? rows.filter((r) => r.isRental)
        : rows.filter((r) => r.assetType === assetFilter)
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey]
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [rows, assetFilter, sortKey, sortDir])

  const numCols: { key: SortKey; label: string }[] = [
    { key: 'deployments', label: 'Deployments' },
    { key: 'daysDeployed', label: 'Days Out' },
    { key: 'utilizationPct', label: 'Util %' },
    { key: 'maintenanceEvents', label: 'Maint. Events' },
    { key: 'maintenanceSpend', label: 'Maint. Spend' },
    { key: 'downtimeDays', label: 'Downtime (d)' },
    { key: 'rentalCost', label: 'Rental Cost' },
  ]

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} mb={1}>
        <Typography variant="h5">Equipment Cost & Utilization</Typography>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={downloadCsv} disabled={loading || rows.length === 0}>
          Export CSV
        </Button>
      </Stack>
      <Typography color="text.secondary" variant="body2" mb={2}>
        Per-asset deployment, utilization, and maintenance spend over the selected window — the scoreboard for reducing unplanned repair spend.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField label="From" type="date" size="small" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField label="To" type="date" size="small" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
          <ToggleButtonGroup size="small" exclusive value={assetFilter} onChange={(_, v) => v && setAssetFilter(v)}>
            <ToggleButton value="ALL">All</ToggleButton>
            <ToggleButton value="VEHICLE">Vehicles</ToggleButton>
            <ToggleButton value="UNIT">Units</ToggleButton>
            <ToggleButton value="RENTAL">Rentals</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Paper>

      {summary && (
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap mb={2}>
          <SummaryCard label="Maint. Spend" value={money(summary.totalMaintenanceSpend)} accent />
          <SummaryCard label="Maint. Events" value={String(summary.totalMaintenanceEvents)} />
          <SummaryCard label="Avg Utilization" value={`${summary.avgUtilizationPct}%`} />
          <SummaryCard label="Downtime (days)" value={String(summary.totalDowntimeDays)} />
          {summary.rentalCount > 0 && (
            <SummaryCard label={`Rental Cost (${summary.rentalCount})`} value={money(summary.totalRentalCost)} accent />
          )}
          <SummaryCard label="Tracked Assets" value={String(summary.assetCount)} />
        </Stack>
      )}

      <Paper variant="outlined">
        {loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>
        ) : visible.length === 0 ? (
          <Box sx={{ p: 4 }}><Typography color="text.secondary" align="center">No assets in this window.</Typography></Box>
        ) : (
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sortDirection={sortKey === 'name' ? sortDir : false}>
                    <TableSortLabel active={sortKey === 'name'} direction={sortKey === 'name' ? sortDir : 'asc'} onClick={() => handleSort('name')}>
                      Asset
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Identifier</TableCell>
                  <TableCell>Kind</TableCell>
                  <TableCell>Status</TableCell>
                  {numCols.map((c) => (
                    <TableCell key={c.key} align="right" sortDirection={sortKey === c.key ? sortDir : false}>
                      <TableSortLabel active={sortKey === c.key} direction={sortKey === c.key ? sortDir : 'desc'} onClick={() => handleSort(c.key)}>
                        {c.label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.map((r) => (
                  <TableRow key={`${r.assetType}-${r.id}`} hover>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="body2" fontWeight={500}>{r.name}</Typography>
                        {r.isRental && <Chip label="Rental" size="small" color="warning" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {r.assetType === 'VEHICLE' ? 'Vehicle' : 'Unit'}
                        {r.isRental && r.rentalCompany ? ` · ${r.rentalCompany}` : ''}
                        {r.isRental && r.rentalCostBasis ? ` · ${r.rentalCostBasis}` : ''}
                      </Typography>
                    </TableCell>
                    <TableCell>{r.identifier ?? '—'}</TableCell>
                    <TableCell>{r.kind}</TableCell>
                    <TableCell><StatusChip status={r.status} kind={r.assetType === 'VEHICLE' ? 'vehicle' : 'equipment'} /></TableCell>
                    <TableCell align="right">{r.deployments}</TableCell>
                    <TableCell align="right">{r.daysDeployed}</TableCell>
                    <TableCell align="right">{r.utilizationPct}%</TableCell>
                    <TableCell align="right">{r.maintenanceEvents}</TableCell>
                    <TableCell align="right">{r.maintenanceSpend > 0 ? money(r.maintenanceSpend) : '—'}</TableCell>
                    <TableCell align="right">{r.downtimeDays || '—'}</TableCell>
                    <TableCell align="right">{r.isRental ? money(r.rentalCost) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  )
}
