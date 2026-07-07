'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Card, CardContent, Stack, Chip, Alert, CircularProgress,
  MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Collapse,
  Divider, Tooltip, IconButton, ToggleButtonGroup, ToggleButton,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import SendIcon from '@mui/icons-material/Send'
import AddIcon from '@mui/icons-material/Add'
import { StatusChip } from '@/components/shared/StatusChip'
import { useToast } from '@/components/shared/useToast'
import { MutationButton } from '@/components/shared/ReadOnly'
import { FulfillmentChecklist, type ChecklistLine, type LineActionData } from '@/components/shared/FulfillmentChecklist'
import {
  RequestComposer,
  type ProjectOption,
  type InventoryOption,
  type VehicleOption,
  type CategoryOption,
} from '@/components/shared/RequestComposer'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReqRow {
  id: string
  status: string
  requestType: string
  label: string | null
  neededBy: string | null
  createdAt: string
  requestedByName: string | null
  forOperatorName: string | null
  projectName: string | null
  lineCount: number
  fulfillerHubId: string | null
  fulfillerOperatorId: string | null
  decisionNote: string | null
}

interface LineRow {
  id: string
  lineType: string
  categoryName: string | null
  itemType: string | null
  vehicleType: string | null
  requestedQty: number
  specificItemName: string | null
  specificVehicleName: string | null
  specificUnitSerial: string | null
  description: string | null
  // F3 fulfillment fields
  fulfillmentStatus?: string
  fulfilledQty?: number | null
  substitutedItemId?: string | null
  substitutedName?: string | null
  resolvedUnitId?: string | null
  denyReason?: string | null
  availableUnits?: { id: string; serialNumber: string | null }[]
  substitutableItems?: { id: string; name: string; availableAtHub: boolean }[]
  // F2 ship-to fields
  shipToHubId?: string | null
  shipToAddress?: string | null
  shipToHubName?: string | null
}

interface HubOption { id: string; name: string; city: string; state: string }
interface OperatorOption { id: string; name: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const TERMINAL = new Set(['FULFILLED', 'CANCELLED', 'DENIED'])

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  TRUCK: 'Truck', TRAILER: 'Trailer', POLARIS_UTV: 'Polaris UTV',
  CAN_AM_UTV: 'Can-Am UTV', CHRISTIE_DRILL: 'Christie Drill', ATV: 'ATV', OTHER: 'Other',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function lineDisplayName(l: LineRow): string {
  if (l.specificItemName) return `${l.specificItemName}${l.specificUnitSerial ? ` · #${l.specificUnitSerial}` : ''}`
  if (l.specificVehicleName) return l.specificVehicleName
  if (l.categoryName) return l.categoryName
  if (l.vehicleType) return VEHICLE_TYPE_LABELS[l.vehicleType] ?? l.vehicleType
  if (l.itemType) return l.itemType
  return l.description ?? 'Item'
}

async function patchRequest(id: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/deployment-requests/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: data.error ?? 'Action failed.' }
  return { ok: true }
}

async function patchLine(
  requestId: string,
  lineId: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/deployment-requests/${requestId}/lines/${lineId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: data.error ?? 'Action failed.' }
  return { ok: true }
}

// ── Forward Hub Dialog ────────────────────────────────────────────────────────

function ForwardHubDialog({ requestId, hubs, onClose, onSuccess }: {
  requestId: string; hubs: HubOption[]; onClose: () => void; onSuccess: () => void
}) {
  const [hubId, setHubId] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const showToast = useToast()

  const submit = async () => {
    if (!hubId) return
    setBusy(true)
    const r = await patchRequest(requestId, { action: 'forward', fulfillerHubId: hubId })
    setBusy(false)
    if (r.ok) { showToast({ message: 'Forwarded to hub.', severity: 'success' }); onSuccess() }
    else setError(r.error ?? 'Failed.')
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Forward to Hub</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField select label="Hub" value={hubId} onChange={(e) => setHubId(e.target.value)} fullWidth sx={{ mt: 1 }}>
          <MenuItem value="">— Select hub —</MenuItem>
          {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name} · {h.city}, {h.state}</MenuItem>)}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={!hubId || busy}>
          {busy ? <CircularProgress size={16} color="inherit" /> : 'Forward'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Forward Operator Dialog ───────────────────────────────────────────────────

function ForwardOperatorDialog({ requestId, operators, onClose, onSuccess }: {
  requestId: string; operators: OperatorOption[]; onClose: () => void; onSuccess: () => void
}) {
  const [opId, setOpId] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const showToast = useToast()

  const submit = async () => {
    if (!opId) return
    setBusy(true)
    const r = await patchRequest(requestId, { action: 'forward', fulfillerOperatorId: opId })
    setBusy(false)
    if (r.ok) { showToast({ message: 'Forwarded to operator.', severity: 'success' }); onSuccess() }
    else setError(r.error ?? 'Failed.')
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Forward to Operator</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField select label="Operator" value={opId} onChange={(e) => setOpId(e.target.value)} fullWidth sx={{ mt: 1 }}>
          <MenuItem value="">— Select operator —</MenuItem>
          {operators.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={!opId || busy}>
          {busy ? <CircularProgress size={16} color="inherit" /> : 'Forward'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Decline Dialog ────────────────────────────────────────────────────────────

function DeclineDialog({ requestId, onClose, onSuccess }: {
  requestId: string; onClose: () => void; onSuccess: () => void
}) {
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const showToast = useToast()

  const submit = async () => {
    setBusy(true)
    const r = await patchRequest(requestId, { action: 'decline', decisionNote: note.trim() || null })
    setBusy(false)
    if (r.ok) { showToast({ message: 'Request declined.', severity: 'success' }); onSuccess() }
    else setError(r.error ?? 'Failed.')
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Decline Request</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField label="Reason (optional)" value={note} onChange={(e) => setNote(e.target.value)} multiline rows={3} fullWidth sx={{ mt: 1 }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" color="error" onClick={() => void submit()} disabled={busy}>
          {busy ? <CircularProgress size={16} color="inherit" /> : 'Decline'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Request Card ──────────────────────────────────────────────────────────────

function RequestCard({ req, hubs, operators, onRefresh }: {
  req: ReqRow; hubs: HubOption[]; operators: OperatorOption[]; onRefresh: () => void
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [lines, setLines] = React.useState<LineRow[] | null>(null)
  const [progress, setProgress] = React.useState<{ checked: number; total: number } | null>(null)
  const [linesLoading, setLinesLoading] = React.useState(false)
  const [dialog, setDialog] = React.useState<'hub' | 'operator' | 'decline' | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const showToast = useToast()

  const loadLines = async () => {
    if (lines !== null) return
    setLinesLoading(true)
    const res = await fetch(`/api/deployment-requests/${req.id}`)
    if (res.ok) {
      const d = await res.json()
      setLines((d.data?.lines as LineRow[]) ?? [])
      setProgress(d.data?.progress ?? null)
    }
    setLinesLoading(false)
  }

  const reloadLines = async () => {
    setLinesLoading(true)
    const res = await fetch(`/api/deployment-requests/${req.id}`)
    if (res.ok) {
      const d = await res.json()
      setLines((d.data?.lines as LineRow[]) ?? [])
      setProgress(d.data?.progress ?? null)
    }
    setLinesLoading(false)
  }

  const toggleExpand = () => {
    if (!expanded) void loadLines()
    setExpanded((e) => !e)
  }

  const action = async (act: string, extra?: Record<string, unknown>) => {
    setBusy(act)
    const r = await patchRequest(req.id, { action: act, ...extra })
    setBusy(null)
    if (r.ok) {
      showToast({ message: 'Done.', severity: 'success' })
      onRefresh()
    } else {
      showToast({ message: r.error ?? 'Action failed.', severity: 'error' })
    }
  }

  const resendLink = async () => {
    setBusy('resend')
    const res = await fetch(`/api/deployment-requests/${req.id}/resend-link`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (res.ok) showToast({ message: 'Hub link resent.', severity: 'success' })
    else showToast({ message: d.error ?? 'Resend failed.', severity: 'error' })
  }

  const hubName = req.fulfillerHubId ? (hubs.find((h) => h.id === req.fulfillerHubId)?.name ?? req.fulfillerHubId) : null
  const opName = req.fulfillerOperatorId ? (operators.find((o) => o.id === req.fulfillerOperatorId)?.name ?? req.fulfillerOperatorId) : null
  const isMaterial = req.requestType === 'MATERIAL'
  const isReservation = req.requestType === 'RESERVATION'
  const isTerminal = TERMINAL.has(req.status)

  // Build checklist lines from loaded LineRow data (RESERVATION only)
  const checklistLines: ChecklistLine[] = React.useMemo(() => {
    if (!lines || !isReservation) return []
    return lines.map((l) => ({
      id: l.id,
      name: lineDisplayName(l),
      requestedQty: l.requestedQty,
      itemType: l.itemType ?? null,
      fulfillmentStatus: l.fulfillmentStatus ?? 'PENDING',
      fulfilledQty: l.fulfilledQty ?? null,
      substitutedItemId: l.substitutedItemId ?? null,
      substitutedName: l.substitutedName ?? null,
      resolvedUnitId: l.resolvedUnitId ?? null,
      denyReason: l.denyReason ?? null,
      availableUnits: l.availableUnits ?? [],
      substitutableItems: l.substitutableItems ?? [],
    }))
  }, [lines, isReservation])

  const onLineAction = async (lineId: string, lineAction: 'confirm' | 'edit' | 'deny', data: LineActionData) => {
    return patchLine(req.id, lineId, { action: lineAction, ...data })
  }

  const onStage = async () => {
    const r = await patchRequest(req.id, { action: 'confirm' })
    if (r.ok) {
      showToast({ message: 'Reservation staged.', severity: 'success' })
      onRefresh()
    } else {
      // Q4: surface the failure instead of silently returning — a rejected stage
      // (e.g. insufficient stock / state mismatch) previously looked like nothing happened.
      showToast({ message: r.error ?? 'Could not stage the reservation.', severity: 'error' })
    }
    return r
  }

  return (
    <>
      <Card variant="outlined">
        <CardContent sx={{ pb: '12px !important' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center" mb={0.5} flexWrap="wrap">
                <StatusChip kind="request" status={req.status} />
                <Chip size="small" variant="outlined" label={isReservation ? 'Reservation' : 'Material'} />
                {hubName && <Chip size="small" variant="outlined" color="primary" label={`Hub: ${hubName}`} />}
                {opName && <Chip size="small" variant="outlined" color="secondary" label={`Operator: ${opName}`} />}
              </Stack>
              <Typography variant="body2" fontWeight={600} noWrap>
                {req.label || (isReservation ? 'Rig Reservation' : 'Material Request')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {req.requestedByName ?? 'Unknown'}
                {req.forOperatorName && ` · for ${req.forOperatorName}`}
                {req.projectName && ` · ${req.projectName}`}
                {req.lineCount > 0 && ` · ${req.lineCount} line${req.lineCount !== 1 ? 's' : ''}`}
                {req.neededBy && ` · Needed ${new Date(req.neededBy).toLocaleDateString()}`}
              </Typography>
              {req.decisionNote && (
                <Typography variant="caption" display="block" color="text.secondary">
                  Note: {req.decisionNote}
                </Typography>
              )}
            </Box>
            <Stack direction="row" spacing={0.5} alignItems="center" flexShrink={0}>
              <Tooltip title={expanded ? 'Hide lines' : 'Show lines'}>
                <IconButton size="small" onClick={toggleExpand}>
                  {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          {/* Lines / checklist panel */}
          <Collapse in={expanded}>
            <Box sx={{ mt: 1.5, pl: 0.5 }}>
              {linesLoading ? (
                <CircularProgress size={18} />
              ) : lines && lines.length > 0 ? (
                isReservation && req.status === 'REQUESTED' ? (
                  // F3: per-line fulfillment checklist for active reservations
                  <FulfillmentChecklist
                    lines={checklistLines}
                    progress={progress ?? { checked: 0, total: checklistLines.length }}
                    onLineAction={onLineAction}
                    onStage={onStage}
                    isActionable
                    stageLabel="Stage (admin)"
                  />
                ) : (
                  // Read-only line list for non-REQUESTED or non-RESERVATION
                  <Stack spacing={0.5}>
                    {lines.map((l) => (
                      <Stack key={l.id} direction="row" justifyContent="space-between" sx={{ fontSize: 13, color: 'text.secondary' }}>
                        <Box sx={{ minWidth: 0 }}>
                          <span>{lineDisplayName(l)}</span>
                          {l.lineType === 'SHIPPING_LABEL' && (l.shipToHubName ?? l.shipToAddress) && (
                            <Typography variant="caption" display="block" color="text.secondary">
                              Ship to: {l.shipToHubName ?? l.shipToAddress}
                            </Typography>
                          )}
                        </Box>
                        <span style={{ flexShrink: 0, marginLeft: 8 }}>×{l.requestedQty}</span>
                      </Stack>
                    ))}
                  </Stack>
                )
              ) : (
                <Typography variant="caption" color="text.secondary">No lines.</Typography>
              )}
            </Box>
          </Collapse>

          {/* Action buttons */}
          {!isTerminal && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {isMaterial && req.status === 'REQUESTED' && (
                  <>
                    <Button size="small" variant="contained" color="success"
                      disabled={!!busy} onClick={() => void action('fulfill')}>
                      {busy === 'fulfill' ? <CircularProgress size={14} color="inherit" /> : 'Fulfill'}
                    </Button>
                    <Button size="small" variant="outlined" disabled={!!busy} onClick={() => setDialog('hub')}>
                      Forward → Hub
                    </Button>
                    <Button size="small" variant="outlined" disabled={!!busy} onClick={() => setDialog('operator')}>
                      Forward → Operator
                    </Button>
                    <Button size="small" variant="outlined" color="error" disabled={!!busy} onClick={() => setDialog('decline')}>
                      Decline
                    </Button>
                  </>
                )}

                {isMaterial && req.status === 'FORWARDED' && (
                  <>
                    <Button size="small" variant="contained" color="success"
                      disabled={!!busy} onClick={() => void action('complete')}>
                      {busy === 'complete' ? <CircularProgress size={14} color="inherit" /> : 'Mark Fulfilled'}
                    </Button>
                    <Button size="small" variant="outlined" color="error" disabled={!!busy}
                      onClick={() => void action('cancel')}>
                      Cancel
                    </Button>
                  </>
                )}

                {isReservation && req.status === 'REQUESTED' && (
                  <>
                    <Button size="small" variant="outlined"
                      disabled={!!busy}
                      onClick={() => { if (!expanded) void loadLines(); setExpanded(true) }}>
                      {expanded ? 'Hide checklist' : 'Open checklist'}
                    </Button>
                    <Button size="small" variant="outlined" color="error" disabled={!!busy}
                      onClick={() => setDialog('decline')}>
                      Decline
                    </Button>
                    {req.fulfillerHubId && (
                      <Tooltip title="Revoke old link and send a new one to the hub">
                        <Button size="small" variant="outlined" startIcon={<SendIcon fontSize="small" />}
                          disabled={!!busy} onClick={() => void resendLink()}>
                          {busy === 'resend' ? <CircularProgress size={14} color="inherit" /> : 'Resend hub link'}
                        </Button>
                      </Tooltip>
                    )}
                  </>
                )}

                {isReservation && req.status === 'STAGED' && (
                  <>
                    <Button size="small" variant="contained" color="success"
                      disabled={!!busy} onClick={() => void action('fulfill')}>
                      {busy === 'fulfill' ? <CircularProgress size={14} color="inherit" /> : 'Fulfill'}
                    </Button>
                    <Button size="small" variant="outlined" color="error" disabled={!!busy}
                      onClick={() => void action('cancel')}>
                      Cancel
                    </Button>
                  </>
                )}

                {req.status === 'DRAFT' && (
                  <Button size="small" variant="outlined" color="error" disabled={!!busy}
                    onClick={() => void action('cancel')}>
                    Cancel
                  </Button>
                )}
              </Stack>
            </>
          )}
        </CardContent>
      </Card>

      {dialog === 'hub' && (
        <ForwardHubDialog requestId={req.id} hubs={hubs} onClose={() => setDialog(null)}
          onSuccess={() => { setDialog(null); onRefresh() }} />
      )}
      {dialog === 'operator' && (
        <ForwardOperatorDialog requestId={req.id} operators={operators} onClose={() => setDialog(null)}
          onSuccess={() => { setDialog(null); onRefresh() }} />
      )}
      {dialog === 'decline' && (
        <DeclineDialog requestId={req.id} onClose={() => setDialog(null)}
          onSuccess={() => { setDialog(null); onRefresh() }} />
      )}
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminRequestsPage() {
  const [requests, setRequests] = React.useState<ReqRow[] | null>(null)
  const [hubs, setHubs] = React.useState<HubOption[]>([])
  const [operators, setOperators] = React.useState<OperatorOption[]>([])
  const [projects, setProjects] = React.useState<ProjectOption[]>([])
  const [inventory, setInventory] = React.useState<InventoryOption[]>([])
  const [vehicles, setVehicles] = React.useState<VehicleOption[]>([])
  const [categories, setCategories] = React.useState<CategoryOption[]>([])
  const [composerOpen, setComposerOpen] = React.useState(false)
  const [composerDataLoaded, setComposerDataLoaded] = React.useState(false)
  const [filterType, setFilterType] = React.useState('ALL')
  const [filterStatus, setFilterStatus] = React.useState('ALL')
  const [filterHub, setFilterHub] = React.useState('ALL')
  const [filterRequester, setFilterRequester] = React.useState('')
  const [activeTab, setActiveTab] = React.useState<'ACTIVE' | 'CLOSED'>('ACTIVE')
  const showToast = useToast()

  const load = React.useCallback(async () => {
    const res = await fetch('/api/deployment-requests')
    if (res.ok) {
      const json = await res.json()
      setRequests((json.data as ReqRow[]) ?? [])
    } else {
      showToast({ message: 'Failed to load requests.', severity: 'error' })
    }
  }, [showToast])

  React.useEffect(() => {
    void load()
    const loadMeta = async () => {
      const [hubsRes, opsRes] = await Promise.all([fetch('/api/hubs'), fetch('/api/operators')])
      if (hubsRes.ok) { const hd = await hubsRes.json(); setHubs((Array.isArray(hd) ? hd : (hd?.data ?? [])) as HubOption[]) }
      if (opsRes.ok) {
        const d = await opsRes.json()
        setOperators((d.data as OperatorOption[]) ?? [])
      }
    }
    void loadMeta()
  }, [load])

  // Lazy-load the data the composer needs (hubs/operators are already loaded above).
  const openComposer = async () => {
    setComposerOpen(true)
    if (composerDataLoaded) return
    const [projectsRes, inventoryRes, vehiclesRes, categoriesRes] = await Promise.all([
      fetch('/api/projects'),
      fetch('/api/inventory?pageSize=200'),
      fetch('/api/vehicles'),
      fetch('/api/categories'),
    ])
    if (projectsRes.ok) { const d = await projectsRes.json(); setProjects((d.data as ProjectOption[]) ?? []) }
    if (inventoryRes.ok) { const d = await inventoryRes.json(); setInventory((d.data as InventoryOption[]) ?? []) }
    if (vehiclesRes.ok) { const d = await vehiclesRes.json(); setVehicles((d.data as VehicleOption[]) ?? []) }
    if (categoriesRes.ok) setCategories((await categoriesRes.json()) as CategoryOption[])
    setComposerDataLoaded(true)
  }

  const filtered = React.useMemo(() => {
    if (!requests) return []
    return requests.filter((r) => {
      const isTerminal = TERMINAL.has(r.status)
      if (activeTab === 'ACTIVE' && isTerminal) return false
      if (activeTab === 'CLOSED' && !isTerminal) return false
      if (filterType !== 'ALL' && r.requestType !== filterType) return false
      if (filterStatus !== 'ALL' && r.status !== filterStatus) return false
      if (filterHub !== 'ALL' && r.fulfillerHubId !== filterHub) return false
      if (filterRequester && !(r.requestedByName ?? '').toLowerCase().includes(filterRequester.toLowerCase())) return false
      return true
    })
  }, [requests, activeTab, filterType, filterStatus, filterHub, filterRequester])

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">Deployment Requests</Typography>
        <Stack direction="row" spacing={1}>
          <MutationButton size="small" variant="contained" startIcon={<AddIcon />} onClick={() => void openComposer()}>
            New Request
          </MutationButton>
          <Button size="small" variant="outlined" onClick={() => void load()}>Refresh</Button>
        </Stack>
      </Stack>

      <ToggleButtonGroup
        value={activeTab}
        exclusive
        onChange={(_e, v) => { if (v) setActiveTab(v as 'ACTIVE' | 'CLOSED') }}
        size="small"
        sx={{ mb: 2 }}
      >
        <ToggleButton value="ACTIVE">Active</ToggleButton>
        <ToggleButton value="CLOSED">Closed</ToggleButton>
      </ToggleButtonGroup>

      {/* Filter bar */}
      <Stack direction="row" spacing={1.5} mb={2} flexWrap="wrap">
        <TextField select size="small" label="Type" value={filterType} onChange={(e) => setFilterType(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="ALL">All types</MenuItem>
          <MenuItem value="RESERVATION">Reservation</MenuItem>
          <MenuItem value="MATERIAL">Material</MenuItem>
        </TextField>
        <TextField select size="small" label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="ALL">All statuses</MenuItem>
          {['DRAFT', 'REQUESTED', 'STAGED', 'FORWARDED', 'FULFILLED', 'DENIED', 'CANCELLED'].map((s) => (
            <MenuItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Hub" value={filterHub} onChange={(e) => setFilterHub(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="ALL">All hubs</MenuItem>
          {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Requester" value={filterRequester}
          onChange={(e) => setFilterRequester(e.target.value)} placeholder="Filter by name…" sx={{ minWidth: 180 }} />
      </Stack>

      {requests === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
          <CircularProgress />
        </Box>
      ) : filtered.length === 0 ? (
        <Typography variant="body2" color="text.secondary" textAlign="center" pt={6}>
          No requests match the current filters.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {filtered.map((req) => (
            <RequestCard key={req.id} req={req} hubs={hubs} operators={operators} onRefresh={load} />
          ))}
        </Stack>
      )}

      {composerOpen && (
        <RequestComposer
          hubs={hubs}
          projects={projects}
          inventory={inventory}
          vehicles={vehicles}
          categories={categories}
          operators={operators}
          onClose={() => setComposerOpen(false)}
          onSubmit={async (body) => {
            const res = await fetch('/api/deployment-requests', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
            if (res.ok) {
              showToast({ message: 'Request created.', severity: 'success' })
              await load()
              return { ok: true }
            }
            const d = await res.json().catch(() => ({}))
            return { ok: false, error: typeof d.error === 'string' ? d.error : 'Failed to create request.' }
          }}
        />
      )}
    </Box>
  )
}
