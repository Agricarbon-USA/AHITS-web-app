'use client'

import * as React from 'react'
import {
  Box, Typography, Stack, Chip, Drawer, Divider, Button, TextField, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Skeleton, Tabs, Tab, IconButton, Link, CircularProgress,
} from '@mui/material'
import BuildIcon from '@mui/icons-material/Build'
import CloseIcon from '@mui/icons-material/Close'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { useToast } from '@/components/shared/useToast'
import { StatusChip } from '@/components/shared/StatusChip'

// ── Types ─────────────────────────────────────────────────────────
interface Ref { id: string; name: string }
interface UnitRef { id: string; qrCodeId: string; serialNumber: string | null; status: string }
interface PhotoRef { id: string; url: string; takenAt: string }

interface MaintenanceTask {
  id: string
  taskName: string
  status: string
  priority: string
  isDamageReport: boolean
  repairType: string | null
  resolutionPath: string | null
  intervalType: string
  intervalValue: number
  nextDue: string | null
  nextOdometer: number | null
  completedAt: string | null
  dateDelivered: string | null
  shopName: string | null
  shopAddress: string | null
  purchaseOrder: string | null
  invoiceNumber: string | null
  locationNote: string | null
  estimatedCost: string | null
  actualCost: string | null
  notes: string | null
  createdAt: string
  vehicle: Ref | null
  item: Ref | null
  unit: UnitRef | null
  repairHub: Ref | null
  hub: Ref | null
  photos: PhotoRef[]
}

type HubOption = { id: string; name: string; city: string; state: string }

type FilterKey = 'damage' | 'overdue' | 'active' | 'completed' | 'all'

const REPAIR_TYPES = [
  { value: 'IN_FIELD', label: 'Fixed in field' },
  { value: 'AT_SHOP', label: 'At a shop' },
  { value: 'SHIP_TO_HUB', label: 'Ship to hub' },
  { value: 'SHIP_FOR_REPAIR', label: 'Ship for repair' },
]

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const fmtMoney = (s: string | null | undefined) =>
  s != null && s !== '' ? `$${Number(s).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
const toDateInput = (s: string | null | undefined) => (s ? new Date(s).toISOString().slice(0, 10) : '')

// Editable draft of the fields the admin can change from this screen.
interface Draft {
  repairType: string
  repairHubId: string
  shopName: string
  shopAddress: string
  purchaseOrder: string
  invoiceNumber: string
  dateDelivered: string
  estimatedCost: string
  actualCost: string
  locationNote: string
  notes: string
}

function draftFrom(t: MaintenanceTask): Draft {
  return {
    repairType: t.repairType ?? '',
    repairHubId: t.repairHub?.id ?? '',
    shopName: t.shopName ?? '',
    shopAddress: t.shopAddress ?? '',
    purchaseOrder: t.purchaseOrder ?? '',
    invoiceNumber: t.invoiceNumber ?? '',
    dateDelivered: toDateInput(t.dateDelivered),
    estimatedCost: t.estimatedCost ?? '',
    actualCost: t.actualCost ?? '',
    locationNote: t.locationNote ?? '',
    notes: t.notes ?? '',
  }
}

export default function AdminMaintenancePage() {
  const showToast = useToast()
  const [tasks, setTasks] = React.useState<MaintenanceTask[]>([])
  const [hubs, setHubs] = React.useState<HubOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [filter, setFilter] = React.useState<FilterKey>('damage')
  const [selected, setSelected] = React.useState<MaintenanceTask | null>(null)
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/maintenance')
      const json = await res.json()
      setTasks(json.data ?? [])
    } catch {
      showToast({ message: 'Could not load maintenance tasks.', severity: 'error' })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  React.useEffect(() => {
    load()
    fetch('/api/hubs').then((r) => r.json()).then((d) => setHubs(d ?? [])).catch(() => {})
  }, [load])

  const counts = React.useMemo(() => ({
    damage: tasks.filter((t) => t.isDamageReport && t.status !== 'COMPLETED').length,
    overdue: tasks.filter((t) => t.status === 'OVERDUE').length,
    active: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
  }), [tasks])

  const visible = React.useMemo(() => tasks.filter((t) => {
    switch (filter) {
      case 'damage': return t.isDamageReport && t.status !== 'COMPLETED'
      case 'overdue': return t.status === 'OVERDUE'
      case 'active': return t.status === 'IN_PROGRESS'
      case 'completed': return t.status === 'COMPLETED'
      default: return true
    }
  }), [tasks, filter])

  function openTask(t: MaintenanceTask) {
    setSelected(t)
    setDraft(draftFrom(t))
  }
  function closeDrawer() {
    setSelected(null)
    setDraft(null)
  }

  async function patch(id: string, body: Record<string, unknown>, successMsg: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/maintenance/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Update failed.', severity: 'error' })
        return false
      }
      const d = await res.json()
      const updated: MaintenanceTask = { ...(selected as MaintenanceTask), ...d.data }
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...d.data } : t)))
      setSelected((s) => (s && s.id === id ? updated : s))
      showToast({ message: successMsg, severity: 'success' })
      return true
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
      return false
    } finally {
      setSaving(false)
    }
  }

  async function saveDraft() {
    if (!selected || !draft) return
    await patch(selected.id, {
      repairType: draft.repairType || null,
      repairHubId: draft.repairHubId || null,
      shopName: draft.shopName || null,
      shopAddress: draft.shopAddress || null,
      purchaseOrder: draft.purchaseOrder || null,
      invoiceNumber: draft.invoiceNumber || null,
      dateDelivered: draft.dateDelivered ? new Date(draft.dateDelivered).toISOString() : null,
      estimatedCost: draft.estimatedCost === '' ? null : Number(draft.estimatedCost),
      actualCost: draft.actualCost === '' ? null : Number(draft.actualCost),
      locationNote: draft.locationNote || null,
      notes: draft.notes || null,
    }, 'Repair details saved.')
  }

  async function setStatus(t: MaintenanceTask, status: string) {
    const body: Record<string, unknown> = { status }
    if (status === 'COMPLETED') body.completedAt = new Date().toISOString()
    if (status === 'IN_PROGRESS') body.completedAt = null
    await patch(t.id, body,
      status === 'COMPLETED' ? 'Marked complete.' : status === 'IN_PROGRESS' ? 'Repair started.' : 'Status updated.')
  }

  const setD = (patchObj: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patchObj } : d))

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1.5} mb={0.5}>
        <BuildIcon color="action" />
        <Typography variant="h5">Maintenance</Typography>
      </Stack>
      <Typography color="text.secondary" mb={2} variant="body2">
        Damage reports from the field and scheduled vehicle/equipment service. Assign a shop or hub, track the repair, and close it out.
      </Typography>

      <Tabs value={filter} onChange={(_, v) => setFilter(v)} sx={{ mb: 2 }} variant="scrollable" allowScrollButtonsMobile>
        <Tab value="damage" label={<Stack direction="row" spacing={1} alignItems="center"><span>Damage reports</span>{counts.damage > 0 && <Chip size="small" color="error" label={counts.damage} />}</Stack>} />
        <Tab value="overdue" label={<Stack direction="row" spacing={1} alignItems="center"><span>Overdue</span>{counts.overdue > 0 && <Chip size="small" color="warning" label={counts.overdue} />}</Stack>} />
        <Tab value="active" label={`In progress${counts.active ? ` (${counts.active})` : ''}`} />
        <Tab value="completed" label="Completed" />
        <Tab value="all" label="All" />
      </Tabs>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Subject</TableCell>
              <TableCell>Task</TableCell>
              <TableCell>Kind</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Priority</TableCell>
              <TableCell>Reported / Due</TableCell>
              <TableCell>Shop / Hub</TableCell>
              <TableCell align="right">Cost</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={8}><Skeleton height={28} /></TableCell></TableRow>
            ))}
            {!loading && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography color="text.secondary" align="center" py={4}>
                    {filter === 'damage' ? 'No open damage reports. Field-reported damage will appear here.' : 'Nothing here right now.'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {!loading && visible.map((t) => (
              <TableRow key={t.id} hover sx={{ cursor: 'pointer' }} onClick={() => openTask(t)}>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>{t.item?.name ?? t.vehicle?.name ?? '—'}</Typography>
                  {t.unit?.serialNumber && <Typography variant="caption" color="text.secondary">S/N {t.unit.serialNumber}</Typography>}
                </TableCell>
                <TableCell><Typography variant="body2">{t.taskName}</Typography></TableCell>
                <TableCell>
                  {t.isDamageReport
                    ? <Chip size="small" color="error" variant="outlined" icon={<WarningAmberIcon />} label="Damage" />
                    : <Chip size="small" variant="outlined" label="Scheduled" />}
                </TableCell>
                <TableCell><StatusChip status={t.status} kind="maintenance" /></TableCell>
                <TableCell><StatusChip status={t.priority} kind="priority" variant="outlined" /></TableCell>
                <TableCell><Typography variant="body2">{t.isDamageReport ? fmtDate(t.createdAt) : fmtDate(t.nextDue)}</Typography></TableCell>
                <TableCell><Typography variant="body2">{t.shopName ?? t.repairHub?.name ?? '—'}</Typography></TableCell>
                <TableCell align="right"><Typography variant="body2">{fmtMoney(t.actualCost ?? t.estimatedCost)}</Typography></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Drawer anchor="right" open={!!selected} onClose={closeDrawer}
        PaperProps={{ sx: { width: { xs: '100%', sm: 460 }, p: 0 } }}>
        {selected && draft && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2, pb: 1 }}>
              <Typography variant="h6" sx={{ pr: 1 }}>{selected.taskName}</Typography>
              <IconButton onClick={closeDrawer} size="small"><CloseIcon /></IconButton>
            </Stack>
            <Divider />
            <Box sx={{ p: 2, overflowY: 'auto', flexGrow: 1 }}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={1}>
                <StatusChip status={selected.status} kind="maintenance" />
                <StatusChip status={selected.priority} kind="priority" variant="outlined" />
                {selected.isDamageReport && <Chip size="small" color="error" variant="outlined" icon={<WarningAmberIcon />} label="Damage report" />}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {selected.item?.name ?? selected.vehicle?.name ?? 'Unassigned subject'}
                {selected.unit?.serialNumber ? ` · S/N ${selected.unit.serialNumber}` : ''}
              </Typography>
              {selected.unit && (
                <Box mt={0.5}><StatusChip status={selected.unit.status} kind="equipment" /></Box>
              )}
              {!selected.isDamageReport && (
                <Typography variant="body2" color="text.secondary" mt={1}>
                  Every {selected.intervalValue} {selected.intervalType.toLowerCase()} · Next due {fmtDate(selected.nextDue)}
                </Typography>
              )}

              {selected.photos.length > 0 && (
                <Box mt={2}>
                  <Typography variant="caption" color="text.secondary">Photos</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mt={0.5}>
                    {selected.photos.map((p) => (
                      <Link key={p.id} href={p.url} target="_blank" rel="noopener noreferrer">
                        <Box component="img" src={p.url} alt="" sx={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }} />
                      </Link>
                    ))}
                  </Stack>
                </Box>
              )}

              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" mb={1.5}>Repair details</Typography>
              <Stack spacing={2}>
                <TextField select size="small" label="Repair type" value={draft.repairType}
                  onChange={(e) => setD({ repairType: e.target.value })}>
                  <MenuItem value="">— Not set —</MenuItem>
                  {REPAIR_TYPES.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
                </TextField>
                <TextField select size="small" label="Repair hub (optional)" value={draft.repairHubId}
                  onChange={(e) => setD({ repairHubId: e.target.value })}>
                  <MenuItem value="">— None —</MenuItem>
                  {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name} — {h.city}, {h.state}</MenuItem>)}
                </TextField>
                <TextField size="small" label="Shop name" value={draft.shopName} onChange={(e) => setD({ shopName: e.target.value })} />
                <TextField size="small" label="Shop address" value={draft.shopAddress} onChange={(e) => setD({ shopAddress: e.target.value })} />
                <Stack direction="row" spacing={2}>
                  <TextField size="small" label="PO #" value={draft.purchaseOrder} onChange={(e) => setD({ purchaseOrder: e.target.value })} fullWidth />
                  <TextField size="small" label="Invoice #" value={draft.invoiceNumber} onChange={(e) => setD({ invoiceNumber: e.target.value })} fullWidth />
                </Stack>
                <TextField size="small" type="date" label="Date delivered" InputLabelProps={{ shrink: true }}
                  value={draft.dateDelivered} onChange={(e) => setD({ dateDelivered: e.target.value })} />
                <Stack direction="row" spacing={2}>
                  <TextField size="small" label="Est. cost" value={draft.estimatedCost} onChange={(e) => setD({ estimatedCost: e.target.value })} fullWidth
                    InputProps={{ startAdornment: <Typography color="text.secondary" mr={0.5}>$</Typography> }} />
                  <TextField size="small" label="Actual cost" value={draft.actualCost} onChange={(e) => setD({ actualCost: e.target.value })} fullWidth
                    InputProps={{ startAdornment: <Typography color="text.secondary" mr={0.5}>$</Typography> }} />
                </Stack>
                <TextField size="small" label="Location note" value={draft.locationNote} onChange={(e) => setD({ locationNote: e.target.value })}
                  helperText="Where the item physically is right now" />
                <TextField size="small" label="Notes" value={draft.notes} onChange={(e) => setD({ notes: e.target.value })} multiline rows={3} />
              </Stack>
            </Box>

            <Divider />
            <Stack spacing={1} sx={{ p: 2 }}>
              <Stack direction="row" spacing={1}>
                {selected.status !== 'IN_PROGRESS' && selected.status !== 'COMPLETED' && (
                  <Button variant="outlined" fullWidth disabled={saving} onClick={() => setStatus(selected, 'IN_PROGRESS')}>Start repair</Button>
                )}
                {selected.status !== 'COMPLETED' ? (
                  <Button variant="outlined" color="success" fullWidth disabled={saving} onClick={() => setStatus(selected, 'COMPLETED')}>Mark complete</Button>
                ) : (
                  <Button variant="outlined" fullWidth disabled={saving} onClick={() => setStatus(selected, 'IN_PROGRESS')}>Reopen</Button>
                )}
              </Stack>
              <Button variant="contained" fullWidth disabled={saving} onClick={saveDraft}
                startIcon={saving ? <CircularProgress size={16} /> : undefined}>
                {saving ? 'Saving…' : 'Save repair details'}
              </Button>
            </Stack>
          </Box>
        )}
      </Drawer>
    </Box>
  )
}
