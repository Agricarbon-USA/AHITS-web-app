'use client'

import * as React from 'react'
import NextLink from 'next/link'
import {
  Box, Typography, Paper, Stack, Button, CircularProgress, Chip, Divider, Link,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer, TableSortLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  Switch, FormControlLabel,
} from '@mui/material'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { EntityFormDialog, RequiredLegend } from '@/components/ui/EntityFormDialog'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import QrCode2Icon from '@mui/icons-material/QrCode2'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { StatusChip } from '@/components/shared/StatusChip'
import { useToast } from '@/components/shared/useToast'
import { useCanEdit, MutationButton, MutationIconButton } from '@/components/shared/ReadOnly'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { QrScanField } from '@/components/shared/QrScanField'
import { useDirtyState } from '@/hooks/useDirtyState'
import { parseApiError } from '@/lib/api-error-shape'
import { downloadQrLabel } from '@/lib/qr-label'
import { groupBy, formatDate } from '@/lib/utils'
import { uploadDocument } from '@/lib/photoStore'
import { VEHICLE_TYPES, vehicleTypeLabel } from '@/lib/vehicle-types'
import { DEFAULT_DAILY_CHECKLIST } from '@/types'
import { DailyCheckViewer } from '@/components/admin/DailyCheckViewer'

const RENTAL_PERIODS: { value: 'DAY' | 'WEEK' | 'MONTH' | 'FLAT'; label: string }[] = [
  { value: 'DAY', label: '/ day' }, { value: 'WEEK', label: '/ week' },
  { value: 'MONTH', label: '/ month' }, { value: 'FLAT', label: 'flat' },
]
const VEHICLE_STATUSES = ['ACTIVE', 'IN_MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED']

interface VehicleRow {
  id: string
  name: string
  type: string
  makeModel: string | null
  year: number | null
  vin: string | null
  licensePlate: string | null
  odometer: number | null
  status: string
  location: string | null
  hubId: string | null
  hubName: string | null
  assignedOperatorName: string | null
  activeProjects: { id: string; name: string }[]
  insuranceExpires: string | null
  registrationExpires: string | null
  notes: string | null
  isRental: boolean
  rentalCompany: string | null
  rentalAgreementNumber: string | null
  rentalAgreementUrl: string | null
  rentalStartDate: string | null
  rentalEndDate: string | null
  rentalLocation: string | null
  rentalReturnLocation: string | null
  rentalCostAmount: string | null
  rentalCostPeriod: 'DAY' | 'WEEK' | 'MONTH' | 'FLAT' | null
  rentalOneWay: boolean
  // Minted server-side on create (or registered from an existing sticker via the
  // create form's "Existing QR label"); read here for the drawer's label download.
  qrCodeId: string
  _count?: { dailyChecks: number; maintenanceTasks: number }
}

interface HubOption { id: string; name: string; city?: string; state?: string }
type SortKey = 'name' | 'type' | 'status' | 'hub' | 'operator' | 'odometer'

interface VehicleDetail extends VehicleRow {
  dailyChecks: { id: string; date: string; operator: { name: string } | null; passFail?: boolean }[]
  maintenanceTasks: {
    id: string; taskName: string; status: string; nextDue: string | null; actualCost: string | null
    // Full MaintenanceTask rows come back; these three tell a service SCHEDULE
    // (recurring, D24/D29) apart from a damage report or a logged field fix.
    isDamageReport?: boolean; intervalValue?: number; deletedAt?: string | null
  }[]
  photos: { id: string; url: string }[]
}

// UXP-6 (6b): the admin checklist list (GET /api/checklist-templates), read once so the
// drawer's Setup block and the per-type group headers can name the checklist a vehicle
// type actually runs. Mirrors lib/checklist-templates resolveChecklistItems: the active
// type-specific template wins (the list is ordered updatedAt DESC within a type — T7's
// "newest edited wins"), else the active general one, else the built-in default.
interface ChecklistTemplateSummary {
  id: string
  name: string
  vehicleType: string | null
  items: { label: string }[]
  isActive: boolean
}

function resolveChecklist(type: string, templates: ChecklistTemplateSummary[]): { name: string; count: number; custom: boolean } {
  const active = templates.filter((t) => t.isActive && t.items.length > 0)
  const specific = active.find((t) => t.vehicleType === type)
  if (specific) return { name: specific.name, count: specific.items.length, custom: true }
  const general = active.find((t) => t.vehicleType === null)
  if (general) return { name: general.name, count: general.items.length, custom: true }
  return { name: 'Built-in default', count: DEFAULT_DAILY_CHECKLIST.length, custom: false }
}

/** A service schedule = a recurring task on the vehicle (not a damage report / field fix). */
function isServiceSchedule(t: VehicleDetail['maintenanceTasks'][number]): boolean {
  return !t.isDamageReport && (t.intervalValue ?? 0) >= 1 && !t.deletedAt
}

// UXP-6 (6b) fit problem: DetailDrawer and EntityFormDialog each arm useHistoryGuard,
// which is built for ONE guarded overlay at a time — two armed guards both answer a
// single hardware Back (both listen to the same popstate), so Back would close the
// form AND the drawer behind it. The page therefore never has both open: a form
// opened from the drawer closes the drawer first and re-opens it when the form closes.
//
// A guard releases its history sentinel asynchronously (`history.back()` in its
// cleanup), so the NEXT overlay must arm only once that pop has landed — otherwise
// the pending pop swallows the new overlay's freshly pushed sentinel and closes it on
// arrival. `__ahitsHistoryGuard` is the sentinel flag useHistoryGuard merges into
// `history.state`: absent → nothing is pending, run now; present → run on the popstate
// the release fires (jsdom never fires it, hence the short fallback timer).
function afterHistoryGuardReleased(fn: () => void) {
  const state = window.history.state as Record<string, unknown> | null
  if (!state?.__ahitsHistoryGuard) { fn(); return }
  let done = false
  const run = () => {
    if (done) return
    done = true
    window.removeEventListener('popstate', run)
    window.clearTimeout(timer)
    fn()
  }
  const timer = window.setTimeout(run, 400)
  window.addEventListener('popstate', run)
}

function expiryMeta(iso: string | null): { label: string; color: 'default' | 'warning' | 'error' } {
  if (!iso) return { label: '—', color: 'default' }
  const d = new Date(iso)
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
  const label = formatDate(d)
  if (days < 0) return { label: `${label} · expired`, color: 'error' }
  if (days <= 30) return { label: `${label} · ${days}d`, color: 'warning' }
  return { label, color: 'default' }
}

const dateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '')

export default function AdminVehiclesPage() {
  const showToast = useToast()
  const canEdit = useCanEdit()
  const [vehicles, setVehicles] = React.useState<VehicleRow[]>([])
  const [hubs, setHubs] = React.useState<HubOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [detail, setDetail] = React.useState<VehicleDetail | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  // CC-26: the read-only daily-check viewer. Opened by a check-history row click or by a
  // failed-check alert deep-link (/admin/vehicles?check=<id>, read on mount below).
  const [viewerCheckId, setViewerCheckId] = React.useState<string | null>(null)
  // UXP-6 (6b): one form, three ways in — Add (blank), Edit (`vehicle`), Duplicate
  // (`duplicateOf`: create mode prefilled minus the uniques). Mounted only while set,
  // so every open starts from fresh field state (and a fresh dirty snapshot).
  const [formState, setFormState] = React.useState<{ vehicle: VehicleRow | null; duplicateOf: VehicleRow | null } | null>(null)
  // The drawer the form was opened from, to re-open once the form closes (see
  // afterHistoryGuardReleased — the drawer and the form never overlap).
  const [formReturnTo, setFormReturnTo] = React.useState<string | null>(null)
  // null = not known (fetch failed / not admin) → the Setup block shows "—", never a guess.
  const [templates, setTemplates] = React.useState<ChecklistTemplateSummary[] | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<VehicleRow | null>(null)
  // CC-10: field-fix dialog
  const [fieldFixOpen, setFieldFixOpen] = React.useState(false)
  const [fieldFixNotes, setFieldFixNotes] = React.useState('')
  const [fieldFixSaving, setFieldFixSaving] = React.useState(false)
  // CC-10: report-damage dialog
  const [reportDamageOpen, setReportDamageOpen] = React.useState(false)
  const [reportDamageNotes, setReportDamageNotes] = React.useState('')
  const [reportDamageRepairType, setReportDamageRepairType] = React.useState('')
  const [reportDamageSaving, setReportDamageSaving] = React.useState(false)

  // Filters & sorting (client-side; the fleet is small).
  const [search, setSearch] = React.useState('')
  const [filterType, setFilterType] = React.useState('')
  const [filterStatus, setFilterStatus] = React.useState('')
  const [filterHub, setFilterHub] = React.useState('')
  const [filterProject, setFilterProject] = React.useState('')
  const [filterRental, setFilterRental] = React.useState('') // '' = all, 'RENTAL', 'OWNED'
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([])
  const [sortKey, setSortKey] = React.useState<SortKey>('name')
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc')
  const [groupByType, setGroupByType] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/vehicles')
      if (!res.ok) { showToast({ message: 'Failed to load vehicles', severity: 'error' }); return }
      const d = await res.json()
      setVehicles(d.data ?? [])
    } catch {
      showToast({ message: 'Failed to load vehicles', severity: 'error' })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  const loadHubs = React.useCallback(async () => {
    try {
      const res = await fetch('/api/hubs')
      if (!res.ok) return
      const d = await res.json()
      setHubs(Array.isArray(d) ? d : (d.data ?? []))
    } catch { /* non-fatal: form falls back to no-hub */ }
  }, [])

  const loadTemplates = React.useCallback(async () => {
    try {
      const res = await fetch('/api/checklist-templates')
      if (!res.ok) return
      const d = await res.json()
      setTemplates(Array.isArray(d?.data) ? d.data : [])
    } catch { /* fail soft: the Setup block shows "—" for the checklist */ }
  }, [])

  React.useEffect(() => { load(); loadHubs(); loadTemplates() }, [load, loadHubs, loadTemplates])

  React.useEffect(() => {
    fetch('/api/projects').then((r) => r.json()).then((d) => setProjects(d.data ?? d ?? [])).catch(() => {})
  }, [])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const visibleVehicles = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = vehicles.filter((v) => {
      if (filterType && v.type !== filterType) return false
      if (filterStatus && v.status !== filterStatus) return false
      if (filterHub && (v.hubId ?? '') !== filterHub) return false
      if (filterProject && !v.activeProjects?.some((p) => p.id === filterProject)) return false
      if (filterRental === 'RENTAL' && !v.isRental) return false
      if (filterRental === 'OWNED' && v.isRental) return false
      if (q) {
        const hay = `${v.name} ${v.makeModel ?? ''} ${v.licensePlate ?? ''} ${v.vin ?? ''} ${v.hubName ?? ''} ${v.assignedOperatorName ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    const dir = sortDir === 'asc' ? 1 : -1
    const val = (v: VehicleRow): string | number => {
      switch (sortKey) {
        case 'type': return v.type
        case 'status': return v.status
        case 'hub': return v.hubName ?? ''
        case 'operator': return v.assignedOperatorName ?? ''
        case 'odometer': return v.odometer ?? -1
        default: return v.name.toLowerCase()
      }
    }
    return [...filtered].sort((a, b) => {
      const av = val(a), bv = val(b)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [vehicles, search, filterType, filterStatus, filterHub, filterProject, filterRental, sortKey, sortDir])

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    setDetail(null)
    try {
      const res = await fetch(`/api/vehicles/${id}`)
      if (!res.ok) { showToast({ message: 'Failed to load vehicle', severity: 'error' }); return }
      const d = await res.json()
      setDetail(d.data)
    } finally {
      setDetailLoading(false)
    }
  }

  // CC-26: URL entry points (declared after openDetail so it's in scope). `?check=<id>`
  // (from a failed-check alert) opens the viewer directly; `?vehicle=<id>` (from the
  // deployment drawer's "View checks") opens that vehicle's drawer — where the
  // check-history trail lives. Absent/stale ids degrade gracefully (the viewer shows
  // "could not be found"; a bad vehicle id just no-ops the drawer fetch).
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const check = params.get('check')
    if (check) setViewerCheckId(check)
    const vehicle = params.get('vehicle')
    if (vehicle) void openDetail(vehicle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // UXP-6 (6b): every way into the form. From the drawer, the drawer closes first and
  // the form arms once the drawer's history sentinel has popped (fit problem, above).
  const openForm = (next: { vehicle?: VehicleRow | null; duplicateOf?: VehicleRow | null }) => {
    const state = { vehicle: next.vehicle ?? null, duplicateOf: next.duplicateOf ?? null }
    if (detail) {
      setFormReturnTo(detail.id)
      setDetail(null)
      afterHistoryGuardReleased(() => setFormState(state))
    } else {
      setFormState(state)
    }
  }
  const closeForm = () => {
    setFormState(null)
    const back = formReturnTo
    setFormReturnTo(null)
    if (back) afterHistoryGuardReleased(() => { void openDetail(back) })
  }
  const handleFormSaved = (saved: { id: string; name: string; isEdit: boolean }) => {
    setFormState(null)
    const back = formReturnTo
    setFormReturnTo(null)
    load()
    if (saved.isEdit) {
      showToast({ message: `${saved.name} updated`, severity: 'success' })
      // Edited from the drawer → bring the (refreshed) drawer back.
      if (back) afterHistoryGuardReleased(() => { void openDetail(back) })
    } else {
      // Added (or duplicated): the toast's Open lands on the NEW vehicle's drawer.
      showToast({
        message: `${saved.name} added`,
        severity: 'success',
        action: { label: 'Open', onClick: () => { void openDetail(saved.id) } },
      })
    }
  }

  const doDelete = async () => {
    if (!confirmDelete) return
    const res = await fetch(`/api/vehicles/${confirmDelete.id}`, { method: 'DELETE' })
    if (res.ok) {
      showToast({ message: `${confirmDelete.name} deleted`, severity: 'success' })
      setConfirmDelete(null)
      setDetail(null)
      load()
    } else {
      const d = await res.json().catch(() => ({}))
      showToast({ message: typeof d.error === 'string' ? d.error : 'Delete failed (vehicle may have history)', severity: 'error' })
    }
  }

  async function submitFieldFix() {
    if (!detail || !fieldFixNotes.trim()) return
    setFieldFixSaving(true)
    try {
      const res = await fetch('/api/maintenance/field-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: detail.id, notes: fieldFixNotes.trim() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Could not log fix.', severity: 'error' })
        return
      }
      showToast({ message: 'Field fix logged.', severity: 'success' })
      setFieldFixOpen(false)
      openDetail(detail.id)
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    } finally {
      setFieldFixSaving(false)
    }
  }

  async function submitReportDamage() {
    if (!detail || !reportDamageNotes.trim()) return
    setReportDamageSaving(true)
    try {
      const res = await fetch(`/api/vehicles/${detail.id}/report-damage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: reportDamageNotes.trim(),
          repairType: reportDamageRepairType || undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Could not report damage.', severity: 'error' })
        return
      }
      showToast({ message: 'Damage reported — vehicle is now IN MAINTENANCE.', severity: 'success' })
      setReportDamageOpen(false)
      load()
      openDetail(detail.id)
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    } finally {
      setReportDamageSaving(false)
    }
  }

  const expiringCount = vehicles.filter((v) => {
    const i = expiryMeta(v.insuranceExpires).color
    const r = expiryMeta(v.registrationExpires).color
    return i !== 'default' || r !== 'default'
  }).length

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} mb={1}>
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography variant="h5">Vehicles</Typography>
          {!canEdit && <Chip size="small" label="View only" variant="outlined" />}
        </Stack>
        <MutationButton variant="contained" startIcon={<AddIcon />} onClick={() => openForm({})}>
          Add Vehicle
        </MutationButton>
      </Stack>
      {expiringCount > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, display: 'flex', alignItems: 'center', gap: 1, borderColor: 'warning.main' }}>
          <WarningAmberIcon color="warning" fontSize="small" />
          <Typography variant="body2">
            {expiringCount} vehicle{expiringCount > 1 ? 's have' : ' has'} insurance or registration expiring within 30 days (or expired).
          </Typography>
        </Paper>
      )}

      {!loading && vehicles.length > 0 && (
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap mb={1.5} alignItems="center">
          <TextField
            size="small" label="Search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, plate, VIN, hub, operator" sx={{ minWidth: 220 }}
          />
          <TextField select size="small" label="Type" value={filterType} onChange={(e) => setFilterType(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="">All types</MenuItem>
            {VEHICLE_TYPES.map((t) => <MenuItem key={t} value={t}>{vehicleTypeLabel(t)}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="">All statuses</MenuItem>
            {VEHICLE_STATUSES.map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Hub" value={filterHub} onChange={(e) => setFilterHub(e.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="">All hubs</MenuItem>
            {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name}</MenuItem>)}
          </TextField>
          {projects.length > 0 && (
            <TextField select size="small" label="Project" value={filterProject} onChange={(e) => setFilterProject(e.target.value)} sx={{ minWidth: 160 }}>
              <MenuItem value="">All projects</MenuItem>
              {projects.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
          )}
          <TextField select size="small" label="Ownership" value={filterRental} onChange={(e) => setFilterRental(e.target.value)} sx={{ minWidth: 140 }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="RENTAL">Rentals</MenuItem>
            <MenuItem value="OWNED">Owned</MenuItem>
          </TextField>
          {(search || filterType || filterStatus || filterHub || filterProject || filterRental) && (
            <Button size="small" onClick={() => { setSearch(''); setFilterType(''); setFilterStatus(''); setFilterHub(''); setFilterProject(''); setFilterRental('') }}>Clear</Button>
          )}
          <Box flexGrow={1} />
          <FormControlLabel
            control={<Switch size="small" checked={groupByType} onChange={(e) => setGroupByType(e.target.checked)} />}
            label={<Typography variant="caption">Group by type</Typography>}
          />
          <Typography variant="caption" color="text.secondary">{visibleVehicles.length} of {vehicles.length}</Typography>
        </Stack>
      )}

      <Paper variant="outlined">
        {loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>
        ) : vehicles.length === 0 ? (
          <Box sx={{ p: 4 }}><Typography color="text.secondary" align="center">No vehicles yet. Add your first vehicle to start tracking.</Typography></Box>
        ) : visibleVehicles.length === 0 ? (
          <Box sx={{ p: 4 }}><Typography color="text.secondary" align="center">No vehicles match these filters.</Typography></Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sortDirection={sortKey === 'name' ? sortDir : false}>
                    <TableSortLabel active={sortKey === 'name'} direction={sortKey === 'name' ? sortDir : 'asc'} onClick={() => toggleSort('name')}>Name</TableSortLabel>
                  </TableCell>
                  <TableCell sortDirection={sortKey === 'type' ? sortDir : false}>
                    <TableSortLabel active={sortKey === 'type'} direction={sortKey === 'type' ? sortDir : 'asc'} onClick={() => toggleSort('type')}>Type</TableSortLabel>
                  </TableCell>
                  <TableCell sortDirection={sortKey === 'status' ? sortDir : false}>
                    <TableSortLabel active={sortKey === 'status'} direction={sortKey === 'status' ? sortDir : 'asc'} onClick={() => toggleSort('status')}>Status</TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }} sortDirection={sortKey === 'hub' ? sortDir : false}>
                    <TableSortLabel active={sortKey === 'hub'} direction={sortKey === 'hub' ? sortDir : 'asc'} onClick={() => toggleSort('hub')}>Hub</TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }} sortDirection={sortKey === 'operator' ? sortDir : false}>
                    <TableSortLabel active={sortKey === 'operator'} direction={sortKey === 'operator' ? sortDir : 'asc'} onClick={() => toggleSort('operator')}>Operator</TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Project</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }} align="right" sortDirection={sortKey === 'odometer' ? sortDir : false}>
                    <TableSortLabel active={sortKey === 'odometer'} direction={sortKey === 'odometer' ? sortDir : 'asc'} onClick={() => toggleSort('odometer')}>Odometer</TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Insurance</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Registration</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }} align="right">Checks</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }} align="right">Maint.</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {groupByType
                  ? groupBy(visibleVehicles, (v) => v.type, [...VEHICLE_TYPES]).flatMap(({ group, items: gv }) => [
                      <TableRow key={`__hdr__${group}`}>
                        <TableCell colSpan={12} sx={{ bgcolor: 'grey.50', py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                            {vehicleTypeLabel(group)} ({gv.length})
                          </Typography>
                        </TableCell>
                      </TableRow>,
                      ...gv.map((v) => {
                        const ins = expiryMeta(v.insuranceExpires)
                        const reg = expiryMeta(v.registrationExpires)
                        return (
                          <TableRow key={v.id} hover sx={{ cursor: 'pointer' }} onClick={() => openDetail(v.id)}>
                            <TableCell>
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                <Typography variant="body2" fontWeight={500}>{v.name}</Typography>
                                {v.isRental && <StatusChip label="Rental" color="warning" variant="outlined" />}
                                {v.isRental && !v.rentalAgreementUrl && <StatusChip label="Agreement needed" color="error" variant="outlined" />}
                              </Stack>
                              {v.makeModel && <Typography variant="caption" color="text.secondary">{v.makeModel}{v.year ? ` · ${v.year}` : ''}</Typography>}
                            </TableCell>
                            <TableCell>{vehicleTypeLabel(v.type)}</TableCell>
                            <TableCell><StatusChip status={v.status} kind="vehicle" /></TableCell>
                            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{v.hubName ?? <Typography variant="caption" color="text.secondary">{v.location || '—'}</Typography>}</TableCell>
                            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{v.assignedOperatorName ?? '—'}</TableCell>
                            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                              <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                {(v.activeProjects ?? []).length === 0
                                  ? <Typography variant="caption" color="text.secondary">—</Typography>
                                  : (v.activeProjects ?? []).map((p) => <Chip key={p.id} size="small" label={p.name} variant="outlined" />)}
                              </Stack>
                            </TableCell>
                            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }} align="right">{v.odometer != null ? v.odometer.toLocaleString() : '—'}</TableCell>
                            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}><Chip size="small" label={ins.label} color={ins.color} variant={ins.color === 'default' ? 'outlined' : 'filled'} /></TableCell>
                            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}><Chip size="small" label={reg.label} color={reg.color} variant={reg.color === 'default' ? 'outlined' : 'filled'} /></TableCell>
                            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }} align="right">{v._count?.dailyChecks ?? 0}</TableCell>
                            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }} align="right">{v._count?.maintenanceTasks ?? 0}</TableCell>
                            <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                              <MutationIconButton tooltip="Edit" size="small" onClick={() => openForm({ vehicle: v })}><EditIcon fontSize="small" /></MutationIconButton>
                              <MutationIconButton tooltip="Duplicate" size="small" onClick={() => openForm({ duplicateOf: v })}><ContentCopyIcon fontSize="small" /></MutationIconButton>
                              <MutationIconButton tooltip="Delete" size="small" onClick={() => setConfirmDelete(v)}><DeleteIcon fontSize="small" /></MutationIconButton>
                            </TableCell>
                          </TableRow>
                        )
                      }),
                    ])
                  : visibleVehicles.map((v) => {
                      const ins = expiryMeta(v.insuranceExpires)
                      const reg = expiryMeta(v.registrationExpires)
                      return (
                        <TableRow key={v.id} hover sx={{ cursor: 'pointer' }} onClick={() => openDetail(v.id)}>
                          <TableCell>
                            <Typography variant="body2" fontWeight={500}>{v.name}</Typography>
                            {v.makeModel && <Typography variant="caption" color="text.secondary">{v.makeModel}{v.year ? ` · ${v.year}` : ''}</Typography>}
                          </TableCell>
                          <TableCell>{vehicleTypeLabel(v.type)}</TableCell>
                          <TableCell><StatusChip status={v.status} kind="vehicle" /></TableCell>
                          <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{v.hubName ?? <Typography variant="caption" color="text.secondary">{v.location || '—'}</Typography>}</TableCell>
                          <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{v.assignedOperatorName ?? '—'}</TableCell>
                          <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                            <Stack direction="row" spacing={0.5} flexWrap="wrap">
                              {(v.activeProjects ?? []).length === 0
                                ? <Typography variant="caption" color="text.secondary">—</Typography>
                                : (v.activeProjects ?? []).map((p) => <Chip key={p.id} size="small" label={p.name} variant="outlined" />)}
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }} align="right">{v.odometer != null ? v.odometer.toLocaleString() : '—'}</TableCell>
                          <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}><Chip size="small" label={ins.label} color={ins.color} variant={ins.color === 'default' ? 'outlined' : 'filled'} /></TableCell>
                          <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}><Chip size="small" label={reg.label} color={reg.color} variant={reg.color === 'default' ? 'outlined' : 'filled'} /></TableCell>
                          <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }} align="right">{v._count?.dailyChecks ?? 0}</TableCell>
                          <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }} align="right">{v._count?.maintenanceTasks ?? 0}</TableCell>
                          <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                            <MutationIconButton tooltip="Edit" size="small" onClick={() => openForm({ vehicle: v })}><EditIcon fontSize="small" /></MutationIconButton>
                            <MutationIconButton tooltip="Duplicate" size="small" onClick={() => openForm({ duplicateOf: v })}><ContentCopyIcon fontSize="small" /></MutationIconButton>
                            <MutationIconButton tooltip="Delete" size="small" onClick={() => setConfirmDelete(v)}><DeleteIcon fontSize="small" /></MutationIconButton>
                          </TableCell>
                        </TableRow>
                      )
                    })
                }
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Detail drawer */}
      <DetailDrawer open={!!detail || detailLoading} onClose={() => setDetail(null)} width={460} paperSx={{ p: 2 }}>
        {detailLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>
        ) : detail ? (
          <Stack spacing={2}>
            {/* UXP-1f: the close X now lives in DetailDrawer (44px, below the AppBar,
                never hit-tests to the notification bell). pr:5 keeps a long name off it. */}
            <Typography variant="h6" sx={{ pr: 5 }}>{detail.name}</Typography>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <StatusChip status={detail.status} kind="vehicle" />
              <Chip size="small" label={vehicleTypeLabel(detail.type)} variant="outlined" />
              {detail.hubName && <Chip size="small" label={detail.hubName} variant="outlined" />}
            </Stack>

            <Box>
              <Typography variant="subtitle2" gutterBottom>Details</Typography>
              <Stack spacing={0.5}>
                <Detail label="Home hub" value={detail.hubName ?? (detail.location || '—')} />
                <Detail label="Assigned operator" value={detail.assignedOperatorName ?? '—'} />
                <Detail label="Make / Model" value={detail.makeModel ?? '—'} />
                <Detail label="Year" value={detail.year != null ? String(detail.year) : '—'} />
                <Detail label="VIN" value={detail.vin ?? '—'} />
                <Detail label="License plate" value={detail.licensePlate ?? '—'} />
                <Detail label="Odometer" value={detail.odometer != null ? detail.odometer.toLocaleString() : '—'} />
                <Detail label="Insurance expires" value={expiryMeta(detail.insuranceExpires).label} color={expiryMeta(detail.insuranceExpires).color} />
                <Detail label="Registration expires" value={expiryMeta(detail.registrationExpires).label} color={expiryMeta(detail.registrationExpires).color} />
              </Stack>
            </Box>

            {detail.isRental && (
              <>
                <Divider />
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                    <Typography variant="subtitle2">Rental</Typography>
                    {!detail.rentalAgreementUrl && <StatusChip label="Agreement needed" color="error" variant="outlined" />}
                  </Stack>
                  <Stack spacing={0.5}>
                    <Detail label="Company" value={detail.rentalCompany ?? '—'} />
                    <Detail label="Agreement #" value={detail.rentalAgreementNumber ?? '—'} />
                    <Detail
                      label="Agreement file"
                      value={detail.rentalAgreementUrl ? 'Attached' : 'Not uploaded'}
                      color={detail.rentalAgreementUrl ? 'default' : 'error'}
                    />
                    <Detail label="Rental dates" value={
                      detail.rentalStartDate || detail.rentalEndDate
                        ? `${formatDate(detail.rentalStartDate)} → ${formatDate(detail.rentalEndDate)}`
                        : '—'
                    } />
                    <Detail label="Pickup location" value={detail.rentalLocation ?? '—'} />
                    {detail.rentalOneWay && <Detail label="Return location" value={detail.rentalReturnLocation ?? '—'} />}
                    <Detail label="Cost basis" value={
                      detail.rentalCostAmount != null && detail.rentalCostPeriod
                        ? `$${Number(detail.rentalCostAmount).toLocaleString()} ${detail.rentalCostPeriod === 'FLAT' ? 'flat' : `/ ${detail.rentalCostPeriod.toLowerCase()}`}`
                        : '—'
                    } />
                    <Detail label="One-way" value={detail.rentalOneWay ? 'Yes' : 'No'} />
                  </Stack>
                  {detail.rentalAgreementUrl && (
                    <Button size="small" variant="outlined" component="a" href={detail.rentalAgreementUrl} target="_blank" rel="noopener" sx={{ mt: 1 }}>
                      View agreement
                    </Button>
                  )}
                </Box>
              </>
            )}

            {detail.notes && (
              <Box><Typography variant="subtitle2" gutterBottom>Notes</Typography><Typography variant="body2" color="text.secondary">{detail.notes}</Typography></Box>
            )}

            {/* UXP-6 (6b): Setup — the D24 chain in one place. A vehicle is "set up" when
                its type's daily checklist is right, its service schedules exist and its
                QR label is on the windshield; each row deep-links to where that is done
                (?checklist= / ?sched= readers on Settings / Maintenance, D12-transitive). */}
            <Divider />
            <Box>
              <Typography variant="subtitle2" gutterBottom>Setup</Typography>
              <Stack spacing={0.75}>
                {(() => {
                  const c = templates ? resolveChecklist(detail.type, templates) : null
                  return (
                    <SetupRow
                      label="Daily checklist"
                      value={c ? `${c.name} (${c.count} items)` : '—'}
                      action={{ label: 'Edit', href: `/admin/settings?checklist=${detail.type}` }}
                    />
                  )
                })()}
                <SetupRow
                  label={`Service schedules (${detail.maintenanceTasks.filter(isServiceSchedule).length})`}
                  value=""
                  action={{ label: 'Add', href: `/admin/maintenance?sched=vehicle:${detail.id}` }}
                />
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                  <Typography variant="body2" color="text.secondary">QR label</Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<QrCode2Icon />}
                    disabled={!detail.qrCodeId}
                    onClick={() => {
                      downloadQrLabel(detail.qrCodeId, detail.name)
                        .catch(() => showToast({ message: 'Could not render the QR label.', severity: 'error' }))
                    }}
                  >
                    Download
                  </Button>
                </Stack>
              </Stack>
            </Box>

            <Divider />
            <Box>
              <Typography variant="subtitle2" gutterBottom>Maintenance ({detail.maintenanceTasks.length})</Typography>
              {detail.maintenanceTasks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No maintenance tasks.</Typography>
              ) : (
                <Stack spacing={0.75}>
                  {detail.maintenanceTasks.slice(0, 8).map((t) => (
                    <Stack key={t.id} direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                      <Box flexGrow={1}>
                        <Typography variant="body2">{t.taskName}</Typography>
                        {t.nextDue && <Typography variant="caption" color="text.secondary">Due {formatDate(t.nextDue)}</Typography>}
                      </Box>
                      {t.actualCost && <Typography variant="caption">${Number(t.actualCost).toLocaleString()}</Typography>}
                      <StatusChip status={t.status} kind="maintenance" />
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>

            <Divider />
            <Box>
              <Typography variant="subtitle2" gutterBottom>Recent daily checks ({detail.dailyChecks.length})</Typography>
              {detail.dailyChecks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No daily checks recorded.</Typography>
              ) : (
                // CC-26: this is the per-vehicle check-history trail — each row now opens
                // the read-only viewer so an admin can inspect the actual answers.
                <Stack spacing={0}>
                  {detail.dailyChecks.map((c) => (
                    <Box
                      key={c.id}
                      onClick={() => setViewerCheckId(c.id)}
                      sx={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1,
                        py: 0.75, px: 1, mx: -1, borderRadius: 1, cursor: 'pointer',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                        <Chip
                          label={c.passFail === false ? 'Fail' : 'Pass'}
                          size="small"
                          color={c.passFail === false ? 'error' : 'success'}
                          variant="outlined"
                        />
                        <Typography variant="body2">{formatDate(c.date)}</Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary" noWrap>{c.operator?.name ?? 'Unknown'}</Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>

            <Stack direction="row" spacing={1} pt={1} flexWrap="wrap" useFlexGap>
              <MutationButton variant="outlined" startIcon={<EditIcon />} onClick={() => openForm({ vehicle: detail })}>Edit</MutationButton>
              <MutationButton variant="outlined" startIcon={<ContentCopyIcon />} onClick={() => openForm({ duplicateOf: detail })}>Duplicate</MutationButton>
              <MutationButton variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => setConfirmDelete(detail)}>Delete</MutationButton>
            </Stack>
            <Divider />
            <Stack spacing={1}>
              <MutationButton
                variant="outlined"
                color="success"
                size="small"
                onClick={() => { setFieldFixNotes(''); setFieldFixOpen(true) }}
              >
                Log fixed issue
              </MutationButton>
              <MutationButton
                variant="outlined"
                color="warning"
                size="small"
                onClick={() => { setReportDamageNotes(''); setReportDamageRepairType(''); setReportDamageOpen(true) }}
              >
                Report damage
              </MutationButton>
            </Stack>
          </Stack>
        ) : null}
      </DetailDrawer>

      {/* CC-26: read-only daily-check viewer (from a check-history row or an alert deep-link). */}
      <DailyCheckViewer checkId={viewerCheckId} open={!!viewerCheckId} onClose={() => setViewerCheckId(null)} />

      {/* CC-10: Log field fix */}
      <Dialog open={fieldFixOpen} onClose={() => setFieldFixOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Log fixed issue — {detail?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={0.5}>
            <Typography variant="body2" color="text.secondary">
              Record an issue that was noticed and fixed on the spot. No repair task is opened and no alert is fired.
            </Typography>
            <TextField
              label="What was fixed"
              value={fieldFixNotes}
              onChange={(e) => setFieldFixNotes(e.target.value)}
              multiline
              rows={3}
              fullWidth
              required
              placeholder="Brief description of the issue and what was done"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFieldFixOpen(false)} disabled={fieldFixSaving}>Cancel</Button>
          <Button
            color="success"
            variant="contained"
            disabled={fieldFixSaving || !fieldFixNotes.trim()}
            onClick={submitFieldFix}
          >
            {fieldFixSaving ? 'Saving…' : 'Log fix'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* CC-10: Report damage */}
      <Dialog open={reportDamageOpen} onClose={() => setReportDamageOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Report damage — {detail?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={0.5}>
            <Typography variant="body2" color="text.secondary">
              Opens a repair task and marks this vehicle IN MAINTENANCE. An admin will assign a shop or hub and close it out.
            </Typography>
            <TextField
              select
              label="Repair type (optional)"
              value={reportDamageRepairType}
              onChange={(e) => setReportDamageRepairType(e.target.value)}
              fullWidth
            >
              <MenuItem value="">Not set</MenuItem>
              <MenuItem value="IN_FIELD">Fixed in field</MenuItem>
              <MenuItem value="AT_SHOP">At a shop</MenuItem>
              <MenuItem value="SHIP_TO_HUB">Ship to hub</MenuItem>
              <MenuItem value="SHIP_FOR_REPAIR">Ship for repair</MenuItem>
            </TextField>
            <TextField
              label="What happened"
              value={reportDamageNotes}
              onChange={(e) => setReportDamageNotes(e.target.value)}
              multiline
              rows={3}
              fullWidth
              required
              placeholder="Describe the damage"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setReportDamageOpen(false)} disabled={reportDamageSaving}>Cancel</Button>
          <Button
            color="warning"
            variant="contained"
            disabled={reportDamageSaving || !reportDamageNotes.trim()}
            onClick={submitReportDamage}
          >
            {reportDamageSaving ? 'Reporting…' : 'Report damage'}
          </Button>
        </DialogActions>
      </Dialog>

      {formState && (
        <VehicleFormDialog
          vehicle={formState.vehicle}
          duplicateOf={formState.duplicateOf}
          hubs={hubs}
          onClose={closeForm}
          onSaved={handleFormSaved}
          showToast={showToast}
        />
      )}

      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete vehicle</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{confirmDelete?.name}</strong>? This can&rsquo;t be undone. Vehicles with maintenance or check history may need to be retired instead.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={doDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function Detail({ label, value, color }: { label: string; value: string; color?: 'default' | 'warning' | 'error' }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={500} color={color === 'error' ? 'error.main' : color === 'warning' ? 'warning.main' : 'text.primary'} textAlign="right">{value}</Typography>
    </Stack>
  )
}

/** A Setup row: label · value · one deep-link action ("Edit" / "Add"). */
function SetupRow({ label, value, action }: { label: string; value: string; action: { label: string; href: string } }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>{label}</Typography>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
        {value && <Typography variant="body2" fontWeight={500} textAlign="right">{value}</Typography>}
        <Link component={NextLink} href={action.href} variant="body2" fontWeight={600} sx={{ flexShrink: 0 }}>
          {action.label}
        </Link>
      </Stack>
    </Stack>
  )
}

type ShowToast = (t: { message: string; severity?: 'success' | 'error' | 'warning' | 'info' }) => void

// ── Add / Edit / Duplicate form (UXP-6 6b, on EntityFormDialog) ───────────────
//
// Every field, default and payload rule of the pre-UXP-6 form is preserved (plan §1
// is the contract): 25 fields; type defaults TRUCK; status is edit-only (create →
// server default ACTIVE); hub None; POST omits empties, PATCH sends null for cleared
// fields; the rental block is nulled when the toggle is off. New: required legend +
// marking, inline field errors from `parseApiError` (no more "Save failed" toast),
// hub as `SearchableSelect` (`name · city, state`), dirty guard + hardware Back,
// full-screen on xs, the create-only "Existing QR label" (→ `qrCodeId`, which PATCH
// deliberately excludes), and Duplicate (create mode minus the uniques).

interface VehicleFormValues {
  name: string
  type: string
  status: string
  makeModel: string
  year: string
  vin: string
  licensePlate: string
  odometer: string
  hubId: string
  location: string
  insuranceExpires: string
  registrationExpires: string
  notes: string
  isRental: boolean
  rentalCompany: string
  rentalAgreementNumber: string
  rentalAgreementUrl: string
  rentalStartDate: string
  rentalEndDate: string
  rentalLocation: string
  rentalReturnLocation: string
  rentalCostAmount: string
  rentalCostPeriod: string
  rentalOneWay: boolean
  qrCodeId: string
}

/**
 * Field state for the three ways in. `duplicate` copies the spec of the vehicle
 * (type, make/model, year, hub, dates, rental terms) and clears what is unique to
 * one physical unit: name ("<name> (copy)"), VIN, plate, odometer reading, QR label,
 * rental agreement number + file.
 */
function vehicleFormValues(source: VehicleRow | null, duplicate: boolean): VehicleFormValues {
  const own = (v: string | null | undefined) => (duplicate ? '' : (v ?? ''))
  return {
    name: source ? (duplicate ? `${source.name} (copy)` : source.name) : '',
    type: source?.type ?? 'TRUCK',
    status: duplicate ? 'ACTIVE' : (source?.status ?? 'ACTIVE'),
    makeModel: source?.makeModel ?? '',
    year: source?.year != null ? String(source.year) : '',
    vin: own(source?.vin),
    licensePlate: own(source?.licensePlate),
    odometer: !duplicate && source?.odometer != null ? String(source.odometer) : '',
    hubId: source?.hubId ?? '',
    location: source?.location ?? '',
    insuranceExpires: dateInput(source?.insuranceExpires),
    registrationExpires: dateInput(source?.registrationExpires),
    notes: source?.notes ?? '',
    isRental: source?.isRental ?? false,
    rentalCompany: source?.rentalCompany ?? '',
    rentalAgreementNumber: own(source?.rentalAgreementNumber),
    rentalAgreementUrl: own(source?.rentalAgreementUrl),
    rentalStartDate: dateInput(source?.rentalStartDate),
    rentalEndDate: dateInput(source?.rentalEndDate),
    rentalLocation: source?.rentalLocation ?? '',
    rentalReturnLocation: source?.rentalReturnLocation ?? '',
    rentalCostAmount: source?.rentalCostAmount != null ? String(source.rentalCostAmount) : '',
    rentalCostPeriod: source?.rentalCostPeriod ?? '',
    rentalOneWay: source?.rentalOneWay ?? false,
    qrCodeId: '',
  }
}

// POST's 409 is a plain string naming the unique that clashed (route.ts: "A vehicle
// with the same name already exists."); land it on the field instead of a banner so
// the fix is one tap away. The QR-label clash and PATCH's 404 (T11) stay form-level
// (QrScanField owns its own error slot for scan failures).
const UNIQUE_HINTS: [RegExp, keyof VehicleFormValues][] = [
  [/same name/i, 'name'],
  [/same vin\b/i, 'vin'],
]

function VehicleFormDialog({ vehicle, duplicateOf, hubs, onClose, onSaved, showToast }: {
  vehicle: VehicleRow | null
  duplicateOf: VehicleRow | null
  hubs: HubOption[]
  onClose: () => void
  onSaved: (saved: { id: string; name: string; isEdit: boolean }) => void
  showToast: ShowToast
}) {
  const isEdit = !!vehicle
  const [v, setV] = React.useState<VehicleFormValues>(() => vehicleFormValues(vehicle ?? duplicateOf, !vehicle && !!duplicateOf))
  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<keyof VehicleFormValues, string>>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [agreementUploading, setAgreementUploading] = React.useState(false)
  // Mounted only while open (values initialised above), so the snapshot is this render's.
  const dirty = useDirtyState(true, v)

  const set = <K extends keyof VehicleFormValues>(key: K, value: VehicleFormValues[K]) => {
    setV((prev) => ({ ...prev, [key]: value }))
    if (fieldErrors[key]) setFieldErrors((prev) => { const next = { ...prev }; delete next[key]; return next })
  }
  const err = (key: keyof VehicleFormValues) => fieldErrors[key]

  const uploadAgreement = async (file: File | undefined) => {
    if (!file) return
    setAgreementUploading(true)
    try {
      const url = await uploadDocument(file)
      set('rentalAgreementUrl', url)
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Upload failed', severity: 'error' })
    } finally {
      setAgreementUploading(false)
    }
  }

  const toIso = (d: string) => (d ? new Date(d).toISOString() : null)
  const numOrNull = (s: string) => (s.trim() === '' ? null : parseInt(s, 10))

  const patchBody = () => {
    const insIso = toIso(v.insuranceExpires)
    const regIso = toIso(v.registrationExpires)
    return {
      name: v.name, type: v.type, status: v.status,
      makeModel: v.makeModel || null,
      year: numOrNull(v.year),
      vin: v.vin || null,
      licensePlate: v.licensePlate || null,
      odometer: numOrNull(v.odometer),
      location: v.location || null,
      hubId: v.hubId || null,
      insuranceExpires: insIso,
      registrationExpires: regIso,
      notes: v.notes || null,
      // NEW-5 rental block (PATCH schema is nullable).
      isRental: v.isRental,
      rentalCompany: v.isRental ? (v.rentalCompany || null) : null,
      rentalAgreementNumber: v.isRental ? (v.rentalAgreementNumber || null) : null,
      rentalAgreementUrl: v.isRental ? (v.rentalAgreementUrl || null) : null,
      rentalStartDate: v.isRental && v.rentalStartDate ? v.rentalStartDate : null,
      rentalEndDate: v.isRental && v.rentalEndDate ? v.rentalEndDate : null,
      rentalLocation: v.isRental ? (v.rentalLocation || null) : null,
      rentalReturnLocation: v.isRental && v.rentalOneWay ? (v.rentalReturnLocation || null) : null,
      rentalCostAmount: v.isRental && v.rentalCostAmount.trim() !== '' && !Number.isNaN(Number(v.rentalCostAmount)) ? Number(v.rentalCostAmount) : null,
      rentalCostPeriod: v.isRental && v.rentalCostPeriod ? v.rentalCostPeriod : null,
      rentalOneWay: v.isRental ? v.rentalOneWay : false,
      // qrCodeId is create-only by contract — PATCH is `.strict()` and excludes it.
    }
  }

  const postBody = () => {
    const insIso = toIso(v.insuranceExpires)
    const regIso = toIso(v.registrationExpires)
    const qr = v.qrCodeId.trim()
    return {
      name: v.name, type: v.type,
      ...(v.makeModel ? { makeModel: v.makeModel } : {}),
      ...(v.year.trim() ? { year: parseInt(v.year, 10) } : {}),
      ...(v.vin ? { vin: v.vin } : {}),
      ...(v.licensePlate ? { licensePlate: v.licensePlate } : {}),
      ...(v.odometer.trim() ? { odometer: parseInt(v.odometer, 10) } : {}),
      ...(v.location ? { location: v.location } : {}),
      ...(v.hubId ? { hubId: v.hubId } : {}),
      ...(insIso ? { insuranceExpires: insIso } : {}),
      ...(regIso ? { registrationExpires: regIso } : {}),
      ...(v.notes ? { notes: v.notes } : {}),
      // PRD §7.7: register the existing sticker's code; omit → the server mints one.
      ...(qr ? { qrCodeId: qr } : {}),
      // NEW-5 rental block (POST schema is optional — omit empties, don't send null).
      ...(v.isRental ? {
        isRental: true,
        rentalOneWay: v.rentalOneWay,
        ...(v.rentalCompany ? { rentalCompany: v.rentalCompany } : {}),
        ...(v.rentalAgreementNumber ? { rentalAgreementNumber: v.rentalAgreementNumber } : {}),
        ...(v.rentalAgreementUrl ? { rentalAgreementUrl: v.rentalAgreementUrl } : {}),
        ...(v.rentalStartDate ? { rentalStartDate: v.rentalStartDate } : {}),
        ...(v.rentalEndDate ? { rentalEndDate: v.rentalEndDate } : {}),
        ...(v.rentalLocation ? { rentalLocation: v.rentalLocation } : {}),
        ...(v.rentalOneWay && v.rentalReturnLocation ? { rentalReturnLocation: v.rentalReturnLocation } : {}),
        ...(v.rentalCostAmount.trim() !== '' && !Number.isNaN(Number(v.rentalCostAmount)) ? { rentalCostAmount: Number(v.rentalCostAmount) } : {}),
        ...(v.rentalCostPeriod ? { rentalCostPeriod: v.rentalCostPeriod } : {}),
      } : {}),
    }
  }

  const submit = async () => {
    if (!v.name.trim()) {
      setFieldErrors({ name: 'Name is required' })
      return false
    }
    setFormError(null)
    setSaving(true)
    try {
      const res = isEdit
        ? await fetch(`/api/vehicles/${vehicle!.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patchBody()) })
        : await fetch('/api/vehicles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(postBody()) })
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        const parsed = parseApiError(body, 'Save failed')
        const fields: Partial<Record<keyof VehicleFormValues, string>> = { ...parsed.fieldErrors }
        let form = parsed.formError
        if (form && !isEdit) {
          const hit = UNIQUE_HINTS.find(([re]) => re.test(form!))
          if (hit) { fields[hit[1]] = form; form = null }
        }
        setFieldErrors(fields)
        setFormError(form)
        return false
      }
      const d = await res.json().catch(() => ({}))
      onSaved({ id: d?.data?.id ?? vehicle?.id ?? '', name: v.name.trim(), isEdit })
    } catch {
      setFormError('Save failed — check your connection and try again.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const hubOptions = React.useMemo(
    () => hubs.map((h) => ({ value: h.id, label: `${h.name}${h.city ? ` · ${h.city}${h.state ? `, ${h.state}` : ''}` : ''}` })),
    [hubs],
  )

  return (
    <EntityFormDialog
      open
      title={isEdit ? 'Edit vehicle' : 'Add vehicle'}
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      submitLabel={isEdit ? 'Save' : 'Add'}
      dirty={dirty}
      formError={formError}
      legend={<RequiredLegend />}
      fullScreenXs
      maxWidth="sm"
    >
      <Stack spacing={2} mt={1}>
        <TextField label="Name" value={v.name} onChange={(e) => set('name', e.target.value)} fullWidth required
          error={!!err('name')} helperText={err('name')} />
        <Stack direction="row" spacing={2}>
          <TextField select label="Type" value={v.type} onChange={(e) => set('type', e.target.value)} fullWidth
            error={!!err('type')} helperText={err('type')}>
            {VEHICLE_TYPES.map((t) => <MenuItem key={t} value={t}>{vehicleTypeLabel(t)}</MenuItem>)}
          </TextField>
          {isEdit && (
            <TextField select label="Status" value={v.status} onChange={(e) => set('status', e.target.value)} fullWidth
              error={!!err('status')} helperText={err('status')}>
              {VEHICLE_STATUSES.map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>)}
            </TextField>
          )}
        </Stack>
        <Stack direction="row" spacing={2}>
          <TextField label="Make / Model" value={v.makeModel} onChange={(e) => set('makeModel', e.target.value)} fullWidth
            error={!!err('makeModel')} helperText={err('makeModel')} />
          <TextField label="Year" type="number" value={v.year} onChange={(e) => set('year', e.target.value)} sx={{ width: 120 }}
            error={!!err('year')} helperText={err('year')} />
        </Stack>
        <Stack direction="row" spacing={2}>
          <TextField label="VIN" value={v.vin} onChange={(e) => set('vin', e.target.value)} fullWidth
            error={!!err('vin')} helperText={err('vin')} />
          <TextField label="License plate" value={v.licensePlate} onChange={(e) => set('licensePlate', e.target.value)} fullWidth
            error={!!err('licensePlate')} helperText={err('licensePlate')} />
        </Stack>
        <Stack direction="row" spacing={2}>
          <TextField label="Odometer" type="number" value={v.odometer} onChange={(e) => set('odometer', e.target.value)} fullWidth
            error={!!err('odometer')} helperText={err('odometer')} />
          <Box sx={{ width: '100%' }}>
            <SearchableSelect
              label="Home hub"
              value={v.hubId}
              onChange={(id) => set('hubId', id)}
              options={hubOptions}
              placeholder="None"
              error={!!err('hubId')}
              helperText={err('hubId') ?? (hubs.length === 0 ? 'No hubs yet — add one under Hubs' : 'Where this vehicle is based')}
            />
            {hubs.length === 0 && (
              <Link component={NextLink} href="/admin/hubs" variant="caption" sx={{ ml: 1.75 }}>Add a hub</Link>
            )}
          </Box>
        </Stack>
        <TextField label="Location notes" value={v.location} onChange={(e) => set('location', e.target.value)} fullWidth
          error={!!err('location')}
          helperText={err('location') ?? 'Free-text detail, e.g. a bay or lot. The home hub above is the primary location.'} />
        <Stack direction="row" spacing={2}>
          <TextField label="Insurance expires" type="date" value={v.insuranceExpires} onChange={(e) => set('insuranceExpires', e.target.value)} fullWidth InputLabelProps={{ shrink: true }}
            error={!!err('insuranceExpires')} helperText={err('insuranceExpires')} />
          <TextField label="Registration expires" type="date" value={v.registrationExpires} onChange={(e) => set('registrationExpires', e.target.value)} fullWidth InputLabelProps={{ shrink: true }}
            error={!!err('registrationExpires')} helperText={err('registrationExpires')} />
        </Stack>
        <TextField label="Notes" value={v.notes} onChange={(e) => set('notes', e.target.value)} fullWidth multiline rows={2}
          error={!!err('notes')} helperText={err('notes')} />

        {!isEdit && (
          // PRD §7.7 / T9: the sticker is already on the windshield — register it now.
          // Create-only: PATCH excludes qrCodeId by design (re-association is an owner call).
          <QrScanField
            label="Existing QR label"
            value={v.qrCodeId}
            onChange={(code) => set('qrCodeId', code)}
            size="medium"
            helperText={err('qrCodeId') ?? 'Leave blank to have a code generated — download the label from the vehicle drawer.'}
          />
        )}

        <Divider />
        <FormControlLabel
          control={<Switch checked={v.isRental} onChange={(e) => set('isRental', e.target.checked)} />}
          label="This is a rental vehicle"
        />
        {v.isRental && (
          <Stack spacing={2}>
            <TextField label="Rental company" value={v.rentalCompany} onChange={(e) => set('rentalCompany', e.target.value)} fullWidth
              error={!!err('rentalCompany')} helperText={err('rentalCompany') ?? 'e.g. Enterprise, United Rentals'} />
            <Stack direction="row" spacing={2}>
              <TextField label="Rental start" type="date" value={v.rentalStartDate} onChange={(e) => set('rentalStartDate', e.target.value)} fullWidth InputLabelProps={{ shrink: true }}
                error={!!err('rentalStartDate')} helperText={err('rentalStartDate')} />
              <TextField label="Rental end" type="date" value={v.rentalEndDate} onChange={(e) => set('rentalEndDate', e.target.value)} fullWidth InputLabelProps={{ shrink: true }}
                error={!!err('rentalEndDate')} helperText={err('rentalEndDate')} />
            </Stack>
            <TextField label="Pickup location" value={v.rentalLocation} onChange={(e) => set('rentalLocation', e.target.value)} fullWidth
              error={!!err('rentalLocation')} helperText={err('rentalLocation')} />
            <FormControlLabel
              control={<Switch checked={v.rentalOneWay} onChange={(e) => set('rentalOneWay', e.target.checked)} />}
              label="One-way rental"
            />
            {v.rentalOneWay && (
              <TextField label="Return location" value={v.rentalReturnLocation} onChange={(e) => set('rentalReturnLocation', e.target.value)} fullWidth
                error={!!err('rentalReturnLocation')} helperText={err('rentalReturnLocation')} />
            )}
            <Stack direction="row" spacing={2}>
              <TextField label="Cost" value={v.rentalCostAmount} onChange={(e) => set('rentalCostAmount', e.target.value)} sx={{ flex: 1 }} inputProps={{ inputMode: 'decimal' }}
                error={!!err('rentalCostAmount')} helperText={err('rentalCostAmount')} />
              <TextField select label="Per" value={v.rentalCostPeriod} onChange={(e) => set('rentalCostPeriod', e.target.value)} sx={{ width: 130 }}
                error={!!err('rentalCostPeriod')} helperText={err('rentalCostPeriod')}>
                {RENTAL_PERIODS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
              </TextField>
            </Stack>
            <TextField label="Agreement number" value={v.rentalAgreementNumber} onChange={(e) => set('rentalAgreementNumber', e.target.value)} fullWidth
              error={!!err('rentalAgreementNumber')} helperText={err('rentalAgreementNumber')} />
            <Box>
              <input id="admin-rental-agreement" type="file" accept="image/*,application/pdf" hidden
                onChange={(e) => uploadAgreement(e.target.files?.[0])} />
              {v.rentalAgreementUrl ? (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Button size="small" variant="outlined" component="a" href={v.rentalAgreementUrl} target="_blank" rel="noopener">View agreement</Button>
                  <Button size="small" color="error" onClick={() => set('rentalAgreementUrl', '')}>Remove</Button>
                </Stack>
              ) : (
                <Stack spacing={0.5}>
                  <Button size="small" variant="outlined" disabled={agreementUploading}
                    onClick={() => document.getElementById('admin-rental-agreement')?.click()}>
                    {agreementUploading ? 'Uploading…' : 'Upload agreement (PDF or image)'}
                  </Button>
                  <Typography variant="caption" color="warning.main">No agreement attached — the rental will be flagged until one is uploaded.</Typography>
                </Stack>
              )}
            </Box>
          </Stack>
        )}
      </Stack>
    </EntityFormDialog>
  )
}
