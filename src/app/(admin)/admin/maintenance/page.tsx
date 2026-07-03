'use client'

import * as React from 'react'
import {
  Box, Typography, Stack, Chip, Drawer, Divider, Button, TextField, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Skeleton, Tabs, Tab, IconButton, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material'
import BuildIcon from '@mui/icons-material/Build'
import CloseIcon from '@mui/icons-material/Close'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { useToast } from '@/components/shared/useToast'
import { StatusChip } from '@/components/shared/StatusChip'
import { RepairReviewDialog } from '@/components/shared/RepairReviewDialog'
import { PhotoGallery } from '@/components/shared/PhotoGallery'
import { useCanEdit, MutationButton } from '@/components/shared/ReadOnly'

interface InoperableUnit {
  id: string
  itemId: string
  itemName: string
  label: string
  inoperableNotes: string | null
  reportedAt: string | null
}

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

// Compact chip for a task's most-recent work-order link state (shop scoreboard).
const WO_CHIP: Record<string, { label: string; color: 'default' | 'info' | 'warning' | 'success' }> = {
  ISSUED: { label: 'Sent', color: 'info' },
  VIEWED: { label: 'Viewed', color: 'info' },
  ACTED: { label: 'In progress', color: 'warning' },
  COMPLETED: { label: 'Completed', color: 'success' },
  REVOKED: { label: 'Revoked', color: 'default' },
  EXPIRED: { label: 'Expired', color: 'default' },
}
function woChip(state?: string) {
  if (!state) return <Typography variant="body2" color="text.secondary">—</Typography>
  const c = WO_CHIP[state] ?? { label: state, color: 'default' as const }
  return <Chip size="small" variant="outlined" color={c.color} label={c.label} />
}

export default function AdminMaintenancePage() {
  const canEdit = useCanEdit()
  const showToast = useToast()
  const [tasks, setTasks] = React.useState<MaintenanceTask[]>([])
  const [hubs, setHubs] = React.useState<HubOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [filter, setFilter] = React.useState<FilterKey>('damage')
  const [selected, setSelected] = React.useState<MaintenanceTask | null>(null)
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [completionOdo, setCompletionOdo] = React.useState('')
  // A.4: close-repair return-destination picker (damage reports only).
  const [closeOpen, setCloseOpen] = React.useState(false)
  const [closeHubId, setCloseHubId] = React.useState('')
  const [closeMethod, setCloseMethod] = React.useState<'' | 'DELIVER' | 'SHIP'>('')
  const [shopEmail, setShopEmail] = React.useState('')
  // maintenanceTaskId → most-recent WORK_ORDER link state (the shop scoreboard).
  const [woLinks, setWoLinks] = React.useState<Map<string, string>>(new Map())
  // The raw URL of the link just issued (only available right after sending —
  // the token is never stored), shown so the admin can copy it manually.
  const [lastLink, setLastLink] = React.useState<string | null>(null)
  const autoOpenedRef = React.useRef(false)
  const [inoperable, setInoperable] = React.useState<InoperableUnit[]>([])
  const [repairUnit, setRepairUnit] = React.useState<InoperableUnit | null>(null)
  const [retireUnit, setRetireUnit] = React.useState<InoperableUnit | null>(null)
  const [retireNote, setRetireNote] = React.useState('')
  const [retiring, setRetiring] = React.useState(false)

  const loadInoperable = React.useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/inoperable-units')
      const json = await res.json()
      setInoperable(json.data ?? [])
    } catch {
      /* non-fatal — the review panel simply stays empty */
    }
  }, [])

  const submitRetire = async () => {
    if (!retireUnit || !retireNote.trim()) return
    setRetiring(true)
    try {
      const res = await fetch(`/api/inventory/${retireUnit.itemId}/review-inoperable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId: retireUnit.id, decision: 'RETIRE', note: retireNote }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Retire failed', severity: 'error' })
        return
      }
      showToast({ message: `${retireUnit.label} retired`, severity: 'success' })
      setRetireUnit(null); setRetireNote('')
      loadInoperable()
    } catch {
      showToast({ message: 'Retire failed', severity: 'error' })
    } finally {
      setRetiring(false)
    }
  }

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

  const loadLinks = React.useCallback(async () => {
    try {
      const res = await fetch('/api/status-links?type=WORK_ORDER')
      const json = await res.json()
      // Rows come newest-first, so the first link seen per task is the latest.
      const map = new Map<string, string>()
      for (const l of (json.data ?? []) as { maintenanceTaskId: string | null; state: string }[]) {
        if (l.maintenanceTaskId && !map.has(l.maintenanceTaskId)) map.set(l.maintenanceTaskId, l.state)
      }
      setWoLinks(map)
    } catch {
      /* non-fatal — the column simply shows no link state */
    }
  }, [])

  React.useEffect(() => {
    load()
    loadLinks()
    loadInoperable()
    fetch('/api/hubs').then((r) => r.json()).then((d) => setHubs(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {})
  }, [load, loadLinks, loadInoperable])

  // Deep link from a dashboard alert (?task=<id>) auto-opens that task once.
  React.useEffect(() => {
    if (autoOpenedRef.current || tasks.length === 0) return
    const taskId = new URLSearchParams(window.location.search).get('task')
    if (!taskId) { autoOpenedRef.current = true; return }
    const t = tasks.find((x) => x.id === taskId)
    if (t) { openTask(t); autoOpenedRef.current = true }
  }, [tasks])

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
    setLastLink(null)
    setShopEmail('')
  }
  function closeDrawer() {
    setSelected(null)
    setDraft(null)
    setLastLink(null)
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      showToast({ message: 'Link copied to clipboard.', severity: 'success' })
    } catch {
      showToast({ message: 'Could not copy automatically — select the link and copy it.', severity: 'error' })
    }
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

  async function sendToShop() {
    if (!selected) return
    if (!shopEmail.trim()) { showToast({ message: 'Enter the shop email first.', severity: 'error' }); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/maintenance/${selected.id}/send-to-shop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail: shopEmail.trim(), recipientName: draft?.shopName || undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast({ message: typeof d.error === 'string' ? d.error : 'Could not send work order.', severity: 'error' })
        return
      }
      showToast({
        message: d.emailed ? 'Work order emailed to the shop.' : 'Work order link created — copy the link below.',
        severity: 'success',
      })
      setLastLink(typeof d.url === 'string' ? d.url : null)
      setShopEmail('')
      loadLinks()
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
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

  async function completeTask(
    t: MaintenanceTask,
    closeData?: { returnDestinationType: string; returnDestinationId: string; repairMethod?: string },
  ) {
    setSaving(true)
    try {
      const res = await fetch(`/api/maintenance/${t.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualCost: draft && draft.actualCost !== '' ? Number(draft.actualCost) : undefined,
          actualOdometer: completionOdo !== '' ? Number(completionOdo) : undefined,
          ...(closeData ?? {}),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Could not complete.', severity: 'error' })
        return
      }
      const d = await res.json()
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...d.data } : x)))
      setSelected((s) => (s && s.id === t.id ? { ...s, ...d.data } : s))
      setCompletionOdo('')
      showToast({
        message: t.isDamageReport ? 'Repair completed — unit returned to service.' : 'Completed — next service scheduled.',
        severity: 'success',
      })
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    } finally {
      setSaving(false)
    }
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
        {!canEdit && <Chip size="small" label="View only" variant="outlined" />}
      </Stack>
      <Typography color="text.secondary" mb={2} variant="body2">
        Damage reports from the field and scheduled vehicle/equipment service. Assign a shop or hub, track the repair, and close it out.
      </Typography>

      {inoperable.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderColor: 'error.main' }}>
          <Stack direction="row" alignItems="center" spacing={1} mb={1}>
            <WarningAmberIcon color="error" fontSize="small" />
            <Typography variant="subtitle2">Inoperable units — needs review ({inoperable.length})</Typography>
          </Stack>
          <Stack divider={<Divider />}>
            {inoperable.map((u) => (
              <Stack key={u.id} direction="row" alignItems="center" spacing={1} py={0.75} flexWrap="wrap">
                <Box flexGrow={1} minWidth={180}>
                  <Typography variant="body2" fontWeight={500}>{u.itemName} · {u.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {u.inoperableNotes ? u.inoperableNotes : 'Reported inoperable'}{u.reportedAt ? ` · ${fmtDate(u.reportedAt)}` : ''}
                  </Typography>
                </Box>
                <MutationButton size="small" variant="outlined" onClick={() => setRepairUnit(u)}>Send for repair</MutationButton>
                <MutationButton size="small" variant="outlined" color="error" onClick={() => { setRetireUnit(u); setRetireNote('') }}>Retire</MutationButton>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}

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
              <TableCell>Work order</TableCell>
              <TableCell align="right">Cost</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={9}><Skeleton height={28} /></TableCell></TableRow>
            ))}
            {!loading && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={9}>
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
                <TableCell>{woChip(woLinks.get(t.id))}</TableCell>
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
                  <Box mt={0.5}>
                    <PhotoGallery
                      photos={selected.photos.map((p) => ({ id: p.id, url: p.url, takenAt: p.takenAt, damage: selected.isDamageReport }))}
                    />
                  </Box>
                </Box>
              )}

              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" mb={1.5}>Repair details</Typography>
              <Stack spacing={2}>
                <TextField select size="small" label="Repair type" value={draft.repairType}
                  onChange={(e) => setD({ repairType: e.target.value })} disabled={!canEdit}>
                  <MenuItem value="">— Not set —</MenuItem>
                  {REPAIR_TYPES.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
                </TextField>
                <TextField select size="small" label="Repair hub (optional)" value={draft.repairHubId}
                  onChange={(e) => setD({ repairHubId: e.target.value })} disabled={!canEdit}>
                  <MenuItem value="">— None —</MenuItem>
                  {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name} — {h.city}, {h.state}</MenuItem>)}
                </TextField>
                <TextField size="small" label="Shop name" value={draft.shopName} onChange={(e) => setD({ shopName: e.target.value })} disabled={!canEdit} />
                <TextField size="small" label="Shop address" value={draft.shopAddress} onChange={(e) => setD({ shopAddress: e.target.value })} disabled={!canEdit} />
                <Stack direction="row" spacing={2}>
                  <TextField size="small" label="PO #" value={draft.purchaseOrder} onChange={(e) => setD({ purchaseOrder: e.target.value })} fullWidth disabled={!canEdit} />
                  <TextField size="small" label="Invoice #" value={draft.invoiceNumber} onChange={(e) => setD({ invoiceNumber: e.target.value })} fullWidth disabled={!canEdit} />
                </Stack>
                <TextField size="small" type="date" label="Date delivered" InputLabelProps={{ shrink: true }}
                  value={draft.dateDelivered} onChange={(e) => setD({ dateDelivered: e.target.value })} disabled={!canEdit} />
                <Stack direction="row" spacing={2}>
                  <TextField size="small" label="Est. cost" value={draft.estimatedCost} onChange={(e) => setD({ estimatedCost: e.target.value })} fullWidth
                    InputProps={{ startAdornment: <Typography color="text.secondary" mr={0.5}>$</Typography> }} disabled={!canEdit} />
                  <TextField size="small" label="Actual cost" value={draft.actualCost} onChange={(e) => setD({ actualCost: e.target.value })} fullWidth
                    InputProps={{ startAdornment: <Typography color="text.secondary" mr={0.5}>$</Typography> }} disabled={!canEdit} />
                </Stack>
                <TextField size="small" label="Location note" value={draft.locationNote} onChange={(e) => setD({ locationNote: e.target.value })}
                  helperText="Where the item physically is right now" disabled={!canEdit} />
                <TextField size="small" label="Notes" value={draft.notes} onChange={(e) => setD({ notes: e.target.value })} multiline rows={3} disabled={!canEdit} />
              </Stack>
            </Box>

            <Divider />
            <Stack spacing={1} sx={{ p: 2 }}>
              {!selected.isDamageReport && selected.intervalType === 'MILEAGE' && selected.status !== 'COMPLETED' && (
                <TextField
                  size="small"
                  label="Odometer at completion (optional)"
                  value={completionOdo}
                  onChange={(e) => setCompletionOdo(e.target.value.replace(/[^0-9]/g, ''))}
                  helperText="Next service is set to this + the interval. Defaults to the vehicle's latest reading."
                />
              )}
              <Stack direction="row" spacing={1}>
                {selected.status !== 'IN_PROGRESS' && selected.status !== 'COMPLETED' && (
                  <MutationButton variant="outlined" fullWidth disabled={saving} onClick={() => setStatus(selected, 'IN_PROGRESS')}>Start repair</MutationButton>
                )}
                {selected.status !== 'COMPLETED' ? (
                  <MutationButton
                    variant="outlined"
                    color="success"
                    fullWidth
                    disabled={saving}
                    onClick={() => {
                      if (selected.isDamageReport) { setCloseHubId(''); setCloseMethod(''); setCloseOpen(true) }
                      else completeTask(selected)
                    }}
                  >
                    {selected.isDamageReport ? 'Close repair…' : 'Complete & reschedule'}
                  </MutationButton>
                ) : (
                  <MutationButton variant="outlined" fullWidth disabled={saving} onClick={() => setStatus(selected, 'IN_PROGRESS')}>Reopen</MutationButton>
                )}
              </Stack>
              <MutationButton variant="contained" fullWidth disabled={saving} onClick={saveDraft}
                startIcon={saving ? <CircularProgress size={16} /> : undefined}>
                {saving ? 'Saving…' : 'Save repair details'}
              </MutationButton>

              <Divider textAlign="left" sx={{ fontSize: 12, color: 'text.secondary', pt: 1 }}>Send to shop</Divider>
              <Typography variant="caption" color="text.secondary">
                Email the shop a private work-order link (problem, asset, photos, ship-to hub). They update status without logging in.
                {woLinks.has(selected.id) && ' Resending supersedes the previous link.'}
              </Typography>
              <Stack direction="row" spacing={1}>
                <TextField size="small" type="email" label="Shop email" value={shopEmail} fullWidth
                  onChange={(e) => setShopEmail(e.target.value)} placeholder="repairs@shop.com" disabled={!canEdit} />
                <MutationButton variant="outlined" disabled={saving || !shopEmail.trim()} onClick={sendToShop} sx={{ whiteSpace: 'nowrap' }}>
                  {woLinks.has(selected.id) ? 'Resend' : 'Send WO'}
                </MutationButton>
              </Stack>
              {lastLink && (
                <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1 }}>
                  <Typography variant="caption" color="text.secondary">Private link (copy if email isn’t configured):</Typography>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                    <Typography variant="caption" sx={{ flex: 1, wordBreak: 'break-all', fontFamily: 'monospace' }}>{lastLink}</Typography>
                    <Button size="small" variant="text" onClick={() => copyLink(lastLink)} sx={{ whiteSpace: 'nowrap' }}>Copy link</Button>
                  </Stack>
                </Box>
              )}
            </Stack>
          </Box>
        )}
      </Drawer>

      {/* Inoperable review — send for repair (shared dialog) */}
      {repairUnit && (
        <RepairReviewDialog
          open
          itemId={repairUnit.itemId}
          unitId={repairUnit.id}
          hubs={hubs}
          onClose={() => setRepairUnit(null)}
          onSuccess={() => { setRepairUnit(null); loadInoperable(); load() }}
        />
      )}

      {/* Inoperable review — retire */}
      <Dialog open={!!retireUnit} onClose={() => setRetireUnit(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Retire unit</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={0.5}>
            <Typography variant="body2">
              Retire <strong>{retireUnit?.itemName} · {retireUnit?.label}</strong>? It will be marked RETIRED and removed from service. History is preserved.
            </Typography>
            <TextField label="Reason (required)" value={retireNote} onChange={(e) => setRetireNote(e.target.value)} multiline rows={2} fullWidth required />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRetireUnit(null)} disabled={retiring}>Cancel</Button>
          <MutationButton color="error" variant="contained" onClick={submitRetire} disabled={retiring || !retireNote.trim()}>
            {retiring ? 'Retiring…' : 'Retire'}
          </MutationButton>
        </DialogActions>
      </Dialog>

      {/* A.4: close repair — choose return destination (no default) */}
      <Dialog open={closeOpen} onClose={() => setCloseOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Close repair</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={0.5}>
            <Typography variant="body2" color="text.secondary">
              Choose where this unit returns. There is no default — the repair can&rsquo;t be closed until a destination is selected.
            </Typography>
            <TextField select label="Return to hub" value={closeHubId} onChange={(e) => setCloseHubId(e.target.value)} fullWidth required>
              {hubs.length === 0
                ? <MenuItem value="" disabled>No hubs configured</MenuItem>
                : hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name} — {h.city}, {h.state}</MenuItem>)}
            </TextField>
            <TextField select label="How it gets there (optional)" value={closeMethod} onChange={(e) => setCloseMethod(e.target.value as '' | 'DELIVER' | 'SHIP')} fullWidth>
              <MenuItem value="">Not specified</MenuItem>
              <MenuItem value="DELIVER">Deliver</MenuItem>
              <MenuItem value="SHIP">Ship</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCloseOpen(false)} disabled={saving}>Cancel</Button>
          <MutationButton
            color="success"
            variant="contained"
            disabled={saving || !closeHubId}
            onClick={async () => {
              if (!selected) return
              await completeTask(selected, {
                returnDestinationType: 'HUB',
                returnDestinationId: closeHubId,
                repairMethod: closeMethod || undefined,
              })
              setCloseOpen(false)
            }}
          >
            {saving ? 'Closing…' : 'Complete repair'}
          </MutationButton>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
