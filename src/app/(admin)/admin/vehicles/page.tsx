'use client'

import * as React from 'react'
import {
  Box, Typography, Paper, Stack, Button, IconButton, CircularProgress, Chip, Divider,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer, TableSortLabel,
  Drawer, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Tooltip,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CloseIcon from '@mui/icons-material/Close'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { StatusChip } from '@/components/shared/StatusChip'
import { useToast } from '@/components/shared/useToast'
import { useCanEdit, MutationButton, MutationIconButton } from '@/components/shared/ReadOnly'

const VEHICLE_TYPES = ['TRUCK', 'TRAILER', 'POLARIS_UTV', 'CAN_AM_UTV', 'CHRISTIE_DRILL', 'ATV', 'OTHER']
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
  insuranceExpires: string | null
  registrationExpires: string | null
  notes: string | null
  _count?: { dailyChecks: number; maintenanceTasks: number }
}

interface HubOption { id: string; name: string; city?: string; state?: string }
type SortKey = 'name' | 'type' | 'status' | 'hub' | 'operator' | 'odometer'

interface VehicleDetail extends VehicleRow {
  dailyChecks: { id: string; date: string; operator: { name: string } | null; passed?: boolean }[]
  maintenanceTasks: { id: string; taskName: string; status: string; nextDue: string | null; actualCost: string | null }[]
  photos: { id: string; url: string }[]
}

function expiryMeta(iso: string | null): { label: string; color: 'default' | 'warning' | 'error' } {
  if (!iso) return { label: '—', color: 'default' }
  const d = new Date(iso)
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
  const label = d.toLocaleDateString()
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
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<VehicleRow | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<VehicleRow | null>(null)

  // Filters & sorting (client-side; the fleet is small).
  const [search, setSearch] = React.useState('')
  const [filterType, setFilterType] = React.useState('')
  const [filterStatus, setFilterStatus] = React.useState('')
  const [filterHub, setFilterHub] = React.useState('')
  const [sortKey, setSortKey] = React.useState<SortKey>('name')
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc')

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

  React.useEffect(() => { load(); loadHubs() }, [load, loadHubs])

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
  }, [vehicles, search, filterType, filterStatus, filterHub, sortKey, sortDir])

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
        <MutationButton variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setFormOpen(true) }}>
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
            {VEHICLE_TYPES.map((t) => <MenuItem key={t} value={t}>{t.replace(/_/g, ' ')}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="">All statuses</MenuItem>
            {VEHICLE_STATUSES.map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Hub" value={filterHub} onChange={(e) => setFilterHub(e.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="">All hubs</MenuItem>
            {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name}</MenuItem>)}
          </TextField>
          {(search || filterType || filterStatus || filterHub) && (
            <Button size="small" onClick={() => { setSearch(''); setFilterType(''); setFilterStatus(''); setFilterHub('') }}>Clear</Button>
          )}
          <Box flexGrow={1} />
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
                  <TableCell sortDirection={sortKey === 'hub' ? sortDir : false}>
                    <TableSortLabel active={sortKey === 'hub'} direction={sortKey === 'hub' ? sortDir : 'asc'} onClick={() => toggleSort('hub')}>Hub</TableSortLabel>
                  </TableCell>
                  <TableCell sortDirection={sortKey === 'operator' ? sortDir : false}>
                    <TableSortLabel active={sortKey === 'operator'} direction={sortKey === 'operator' ? sortDir : 'asc'} onClick={() => toggleSort('operator')}>Operator</TableSortLabel>
                  </TableCell>
                  <TableCell align="right" sortDirection={sortKey === 'odometer' ? sortDir : false}>
                    <TableSortLabel active={sortKey === 'odometer'} direction={sortKey === 'odometer' ? sortDir : 'asc'} onClick={() => toggleSort('odometer')}>Odometer</TableSortLabel>
                  </TableCell>
                  <TableCell>Insurance</TableCell>
                  <TableCell>Registration</TableCell>
                  <TableCell align="right">Checks</TableCell>
                  <TableCell align="right">Maint.</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleVehicles.map((v) => {
                  const ins = expiryMeta(v.insuranceExpires)
                  const reg = expiryMeta(v.registrationExpires)
                  return (
                    <TableRow key={v.id} hover sx={{ cursor: 'pointer' }} onClick={() => openDetail(v.id)}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>{v.name}</Typography>
                        {v.makeModel && <Typography variant="caption" color="text.secondary">{v.makeModel}{v.year ? ` · ${v.year}` : ''}</Typography>}
                      </TableCell>
                      <TableCell>{v.type.replace(/_/g, ' ')}</TableCell>
                      <TableCell><StatusChip status={v.status} kind="vehicle" /></TableCell>
                      <TableCell>{v.hubName ?? <Typography variant="caption" color="text.secondary">{v.location || '—'}</Typography>}</TableCell>
                      <TableCell>{v.assignedOperatorName ?? '—'}</TableCell>
                      <TableCell align="right">{v.odometer != null ? v.odometer.toLocaleString() : '—'}</TableCell>
                      <TableCell><Chip size="small" label={ins.label} color={ins.color} variant={ins.color === 'default' ? 'outlined' : 'filled'} /></TableCell>
                      <TableCell><Chip size="small" label={reg.label} color={reg.color} variant={reg.color === 'default' ? 'outlined' : 'filled'} /></TableCell>
                      <TableCell align="right">{v._count?.dailyChecks ?? 0}</TableCell>
                      <TableCell align="right">{v._count?.maintenanceTasks ?? 0}</TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <MutationIconButton tooltip="Edit" size="small" onClick={() => { setEditing(v); setFormOpen(true) }}><EditIcon fontSize="small" /></MutationIconButton>
                        <MutationIconButton tooltip="Delete" size="small" onClick={() => setConfirmDelete(v)}><DeleteIcon fontSize="small" /></MutationIconButton>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Detail drawer */}
      <Drawer anchor="right" open={!!detail || detailLoading} onClose={() => setDetail(null)} PaperProps={{ sx: { width: { xs: '100%', sm: 460 }, p: 2 } }}>
        {detailLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>
        ) : detail ? (
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="h6">{detail.name}</Typography>
              <IconButton size="small" onClick={() => setDetail(null)}><CloseIcon /></IconButton>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <StatusChip status={detail.status} kind="vehicle" />
              <Chip size="small" label={detail.type.replace(/_/g, ' ')} variant="outlined" />
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

            {detail.notes && (
              <Box><Typography variant="subtitle2" gutterBottom>Notes</Typography><Typography variant="body2" color="text.secondary">{detail.notes}</Typography></Box>
            )}

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
                        {t.nextDue && <Typography variant="caption" color="text.secondary">Due {new Date(t.nextDue).toLocaleDateString()}</Typography>}
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
                <Stack spacing={0.5}>
                  {detail.dailyChecks.map((c) => (
                    <Stack key={c.id} direction="row" justifyContent="space-between">
                      <Typography variant="body2">{new Date(c.date).toLocaleDateString()}</Typography>
                      <Typography variant="caption" color="text.secondary">{c.operator?.name ?? 'Unknown'}</Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>

            <Stack direction="row" spacing={1} pt={1}>
              <MutationButton variant="outlined" startIcon={<EditIcon />} onClick={() => { setEditing(detail); setFormOpen(true) }}>Edit</MutationButton>
              <MutationButton variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => setConfirmDelete(detail)}>Delete</MutationButton>
            </Stack>
          </Stack>
        ) : null}
      </Drawer>

      {formOpen && (
        <VehicleFormDialog
          vehicle={editing}
          hubs={hubs}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); load(); if (detail) openDetail(detail.id) }}
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

type ShowToast = (t: { message: string; severity?: 'success' | 'error' | 'warning' | 'info' }) => void

function VehicleFormDialog({ vehicle, hubs, onClose, onSaved, showToast }: {
  vehicle: VehicleRow | null
  hubs: HubOption[]
  onClose: () => void
  onSaved: () => void
  showToast: ShowToast
}) {
  const isEdit = !!vehicle
  const [name, setName] = React.useState(vehicle?.name ?? '')
  const [type, setType] = React.useState(vehicle?.type ?? 'TRUCK')
  const [status, setStatus] = React.useState(vehicle?.status ?? 'ACTIVE')
  const [makeModel, setMakeModel] = React.useState(vehicle?.makeModel ?? '')
  const [year, setYear] = React.useState(vehicle?.year != null ? String(vehicle.year) : '')
  const [vin, setVin] = React.useState(vehicle?.vin ?? '')
  const [licensePlate, setLicensePlate] = React.useState(vehicle?.licensePlate ?? '')
  const [odometer, setOdometer] = React.useState(vehicle?.odometer != null ? String(vehicle.odometer) : '')
  const [hubId, setHubId] = React.useState(vehicle?.hubId ?? '')
  const [location, setLocation] = React.useState(vehicle?.location ?? '')
  const [insuranceExpires, setInsuranceExpires] = React.useState(dateInput(vehicle?.insuranceExpires))
  const [registrationExpires, setRegistrationExpires] = React.useState(dateInput(vehicle?.registrationExpires))
  const [notes, setNotes] = React.useState(vehicle?.notes ?? '')
  const [saving, setSaving] = React.useState(false)

  const toIso = (d: string) => (d ? new Date(d).toISOString() : null)
  const numOrNull = (s: string) => (s.trim() === '' ? null : parseInt(s, 10))

  const save = async () => {
    if (!name.trim()) { showToast({ message: 'Name is required', severity: 'error' }); return }
    setSaving(true)
    try {
      const insIso = toIso(insuranceExpires)
      const regIso = toIso(registrationExpires)
      let res: Response
      if (isEdit) {
        res = await fetch(`/api/vehicles/${vehicle!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name, type, status,
            makeModel: makeModel || null,
            year: numOrNull(year),
            vin: vin || null,
            licensePlate: licensePlate || null,
            odometer: numOrNull(odometer),
            location: location || null,
            hubId: hubId || null,
            insuranceExpires: insIso,
            registrationExpires: regIso,
            notes: notes || null,
          }),
        })
      } else {
        res = await fetch('/api/vehicles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name, type,
            ...(makeModel ? { makeModel } : {}),
            ...(year.trim() ? { year: parseInt(year, 10) } : {}),
            ...(vin ? { vin } : {}),
            ...(licensePlate ? { licensePlate } : {}),
            ...(odometer.trim() ? { odometer: parseInt(odometer, 10) } : {}),
            ...(location ? { location } : {}),
            ...(hubId ? { hubId } : {}),
            ...(insIso ? { insuranceExpires: insIso } : {}),
            ...(regIso ? { registrationExpires: regIso } : {}),
            ...(notes ? { notes } : {}),
          }),
        })
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Save failed', severity: 'error' })
        return
      }
      showToast({ message: isEdit ? 'Vehicle updated' : 'Vehicle added', severity: 'success' })
      onSaved()
    } catch {
      showToast({ message: 'Save failed', severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? `Edit ${vehicle!.name}` : 'Add Vehicle'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth required />
          <Stack direction="row" spacing={2}>
            <TextField select label="Type" value={type} onChange={(e) => setType(e.target.value)} fullWidth>
              {VEHICLE_TYPES.map((t) => <MenuItem key={t} value={t}>{t.replace(/_/g, ' ')}</MenuItem>)}
            </TextField>
            {isEdit && (
              <TextField select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} fullWidth>
                {VEHICLE_STATUSES.map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>)}
              </TextField>
            )}
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField label="Make / Model" value={makeModel} onChange={(e) => setMakeModel(e.target.value)} fullWidth />
            <TextField label="Year" type="number" value={year} onChange={(e) => setYear(e.target.value)} sx={{ width: 120 }} />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField label="VIN" value={vin} onChange={(e) => setVin(e.target.value)} fullWidth />
            <TextField label="License plate" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} fullWidth />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField label="Odometer" type="number" value={odometer} onChange={(e) => setOdometer(e.target.value)} fullWidth />
            <TextField select label="Home hub" value={hubId} onChange={(e) => setHubId(e.target.value)} fullWidth
              helperText={hubs.length === 0 ? 'No hubs yet — add one under Hubs' : 'Where this vehicle is based'}>
              <MenuItem value=""><em>None</em></MenuItem>
              {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name}{h.city ? ` · ${h.city}${h.state ? `, ${h.state}` : ''}` : ''}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField label="Location notes (optional)" value={location} onChange={(e) => setLocation(e.target.value)} fullWidth
            helperText="Free-text detail, e.g. a bay or lot. The home hub above is the primary location." />
          <Stack direction="row" spacing={2}>
            <TextField label="Insurance expires" type="date" value={insuranceExpires} onChange={(e) => setInsuranceExpires(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
            <TextField label="Registration expires" type="date" value={registrationExpires} onChange={(e) => setRegistrationExpires(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
          </Stack>
          <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline rows={2} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save' : 'Add'}</Button>
      </DialogActions>
    </Dialog>
  )
}
