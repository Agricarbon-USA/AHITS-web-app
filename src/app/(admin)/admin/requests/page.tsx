'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Card, CardContent, Stack, Chip, Alert, CircularProgress, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, IconButton, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Collapse,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

const VEHICLE_TYPE_OPTIONS = [
  { value: 'TRUCK', label: 'Truck' }, { value: 'TRAILER', label: 'Trailer' },
  { value: 'POLARIS_UTV', label: 'Polaris UTV' }, { value: 'CAN_AM_UTV', label: 'Can-Am UTV' },
  { value: 'CHRISTIE_DRILL', label: 'Christie Drill' }, { value: 'ATV', label: 'ATV' }, { value: 'OTHER', label: 'Other' },
]

interface ReqRow {
  id: string; status: string; label: string | null; neededBy: string | null; createdAt: string
  requestedByName: string | null; forOperatorName: string | null; projectName: string | null; lineCount: number
}
interface LineRow { id: string; lineType: string; categoryName: string | null; itemType: string | null; vehicleType: string | null; requestedQty: number }
interface DraftLine { lineType: 'KIT_ITEM' | 'VEHICLE'; categoryId: string; vehicleType: string; requestedQty: number }
interface Named { id: string; name: string }

const STATUS_CHIP: Record<string, { color: 'default' | 'info' | 'warning' | 'success' }> = {
  DRAFT: { color: 'default' }, REQUESTED: { color: 'warning' }, STAGED: { color: 'info' },
  FULFILLED: { color: 'success' }, CANCELLED: { color: 'default' },
}
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—')

export default function AdminRequestsPage() {
  const [rows, setRows] = React.useState<ReqRow[] | null>(null)
  const [categories, setCategories] = React.useState<Named[]>([])
  const [operators, setOperators] = React.useState<Named[]>([])
  const [projects, setProjects] = React.useState<Named[]>([])
  const [toast, setToast] = React.useState('')
  const [error, setError] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [cancelId, setCancelId] = React.useState<string | null>(null)
  const [expanded, setExpanded] = React.useState<string | null>(null)
  const [lines, setLinesState] = React.useState<Record<string, LineRow[]>>({})

  // new-request form
  const [label, setLabel] = React.useState('')
  const [projectId, setProjectId] = React.useState('')
  const [forOperatorId, setForOperatorId] = React.useState('')
  const [neededBy, setNeededBy] = React.useState('')
  const [draftLines, setDraftLines] = React.useState<DraftLine[]>([])

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 4000) }
  const showError = (m: string) => { setError(m); setTimeout(() => setError(''), 6000) }

  const load = React.useCallback(() => {
    fetch('/api/deployment-requests').then((r) => r.ok ? r.json() : null).then((d) => setRows(d?.data ?? [])).catch(() => setRows([]))
  }, [])
  React.useEffect(() => {
    load()
    fetch('/api/categories').then((r) => r.json()).then((d) => setCategories(Array.isArray(d) ? d : d?.data ?? [])).catch(() => {})
    fetch('/api/operators').then((r) => r.json()).then((d) => setOperators(Array.isArray(d) ? d : d?.data ?? [])).catch(() => {})
    fetch('/api/projects').then((r) => r.json()).then((d) => setProjects(Array.isArray(d) ? d : d?.data ?? [])).catch(() => {})
  }, [load])

  const resetForm = () => { setLabel(''); setProjectId(''); setForOperatorId(''); setNeededBy(''); setDraftLines([]) }
  const addLine = () => setDraftLines((p) => [...p, { lineType: 'KIT_ITEM', categoryId: '', vehicleType: '', requestedQty: 1 }])
  const setLine = (i: number, patch: Partial<DraftLine>) => setDraftLines((p) => p.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const removeLine = (i: number) => setDraftLines((p) => p.filter((_, idx) => idx !== i))

  const submit = async (status: 'DRAFT' | 'REQUESTED') => {
    if (draftLines.length === 0) { showError('Add at least one item or vehicle.'); return }
    for (const l of draftLines) {
      if (l.lineType === 'KIT_ITEM' && !l.categoryId) { showError('Pick a category for each kit-item line.'); return }
      if (l.lineType === 'VEHICLE' && !l.vehicleType) { showError('Pick a vehicle type for each vehicle line.'); return }
    }
    setSaving(true)
    try {
      const res = await fetch('/api/deployment-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim() || null,
          projectId: projectId || null,
          forOperatorId: forOperatorId || null,
          neededBy: neededBy ? new Date(neededBy).toISOString() : null,
          status,
          lines: draftLines.map((l) => l.lineType === 'KIT_ITEM'
            ? { lineType: 'KIT_ITEM', categoryId: l.categoryId, requestedQty: l.requestedQty }
            : { lineType: 'VEHICLE', vehicleType: l.vehicleType, requestedQty: l.requestedQty }),
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); showError(typeof d.error === 'string' ? d.error : 'Could not save request'); return }
      showToast(status === 'DRAFT' ? 'Draft saved' : 'Request submitted')
      setOpen(false); resetForm(); load()
    } finally { setSaving(false) }
  }

  const transition = async (id: string, action: 'submit' | 'cancel') => {
    const res = await fetch(`/api/deployment-requests/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    })
    if (res.ok) { showToast(action === 'submit' ? 'Submitted' : 'Cancelled'); load() }
    else { const d = await res.json().catch(() => ({})); showError(typeof d.error === 'string' ? d.error : 'Action failed') }
  }

  const toggleExpand = async (id: string) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!lines[id]) {
      const d = await fetch(`/api/deployment-requests/${id}`).then((r) => r.ok ? r.json() : null).catch(() => null)
      if (d?.data?.lines) setLinesState((p) => ({ ...p, [id]: d.data.lines }))
    }
  }

  const lineLabel = (l: LineRow) =>
    l.lineType === 'VEHICLE'
      ? `${VEHICLE_TYPE_OPTIONS.find((v) => v.value === l.vehicleType)?.label ?? l.vehicleType ?? 'Vehicle'} ×${l.requestedQty}`
      : `${l.categoryName ?? l.itemType ?? 'Kit item'} ×${l.requestedQty}`

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Box>
          <Typography variant="h5">Deployment Requests</Typography>
          <Typography variant="body2" color="text.secondary">Pre-specify the equipment a deployment needs so a hub can stage it before pickup.</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { resetForm(); setOpen(true) }}>New Request</Button>
      </Stack>

      {toast && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setToast('')}>{toast}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {rows === null ? <CircularProgress size={24} />
        : rows.length === 0 ? <Alert severity="info">No deployment requests yet. Create one to stage gear ahead of a deployment.</Alert>
        : (
          <Stack spacing={1.5}>
            {rows.map((r) => (
              <Card key={r.id} variant="outlined">
                <CardContent sx={{ pb: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" useFlexGap>
                    <Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="subtitle1" fontWeight={600}>{r.label || 'Untitled request'}</Typography>
                        <Chip size="small" label={r.status} color={STATUS_CHIP[r.status]?.color ?? 'default'} variant={r.status === 'CANCELLED' ? 'outlined' : 'filled'} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {r.lineCount} line{r.lineCount !== 1 ? 's' : ''}
                        {r.projectName ? ` · ${r.projectName}` : ''}
                        {r.forOperatorName ? ` · for ${r.forOperatorName}` : ''}
                        {r.neededBy ? ` · needed ${fmtDate(r.neededBy)}` : ''}
                        {` · by ${r.requestedByName ?? 'Unknown'}`}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {r.status === 'DRAFT' && <Button size="small" onClick={() => transition(r.id, 'submit')}>Submit</Button>}
                      {['DRAFT', 'REQUESTED', 'STAGED'].includes(r.status) && <Button size="small" color="error" onClick={() => setCancelId(r.id)}>Cancel</Button>}
                      <IconButton size="small" onClick={() => toggleExpand(r.id)}>{expanded === r.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton>
                    </Stack>
                  </Stack>
                  <Collapse in={expanded === r.id} unmountOnExit>
                    <Divider sx={{ my: 1 }} />
                    {lines[r.id] ? (
                      lines[r.id].length === 0 ? <Typography variant="body2" color="text.secondary">No lines.</Typography>
                        : <Stack spacing={0.25}>{lines[r.id].map((l) => <Typography key={l.id} variant="body2">• {lineLabel(l)}</Typography>)}</Stack>
                    ) : <CircularProgress size={16} />}
                  </Collapse>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Deployment Request</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField label="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth />
            <Stack direction="row" spacing={2}>
              <TextField select label="Project (optional)" value={projectId} onChange={(e) => setProjectId(e.target.value)} fullWidth>
                <MenuItem value="">None</MenuItem>
                {projects.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
              </TextField>
              <TextField select label="For operator (optional)" value={forOperatorId} onChange={(e) => setForOperatorId(e.target.value)} fullWidth>
                <MenuItem value="">Unassigned</MenuItem>
                {operators.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
              </TextField>
            </Stack>
            <TextField type="date" label="Needed by (optional)" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />

            <Divider textAlign="left" sx={{ fontSize: 13, color: 'text.secondary' }}>Requested items & vehicles</Divider>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableBody>
                  {draftLines.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ width: 130 }}>
                        <TextField select size="small" value={l.lineType} onChange={(e) => setLine(i, { lineType: e.target.value as DraftLine['lineType'] })} fullWidth>
                          <MenuItem value="KIT_ITEM">Kit item</MenuItem>
                          <MenuItem value="VEHICLE">Vehicle</MenuItem>
                        </TextField>
                      </TableCell>
                      <TableCell>
                        {l.lineType === 'KIT_ITEM' ? (
                          <TextField select size="small" label="Category" value={l.categoryId} onChange={(e) => setLine(i, { categoryId: e.target.value })} fullWidth>
                            {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                          </TextField>
                        ) : (
                          <TextField select size="small" label="Vehicle type" value={l.vehicleType} onChange={(e) => setLine(i, { vehicleType: e.target.value })} fullWidth>
                            {VEHICLE_TYPE_OPTIONS.map((v) => <MenuItem key={v.value} value={v.value}>{v.label}</MenuItem>)}
                          </TextField>
                        )}
                      </TableCell>
                      <TableCell sx={{ width: 80 }}>
                        <TextField size="small" type="number" label="Qty" value={l.requestedQty}
                          onChange={(e) => setLine(i, { requestedQty: Math.max(1, parseInt(e.target.value) || 1) })} inputProps={{ min: 1 }} fullWidth />
                      </TableCell>
                      <TableCell sx={{ width: 40 }}><IconButton size="small" color="error" onClick={() => removeLine(i)}><DeleteIcon fontSize="small" /></IconButton></TableCell>
                    </TableRow>
                  ))}
                  {draftLines.length === 0 && <TableRow><TableCell colSpan={4} align="center" sx={{ py: 2, color: 'text.secondary' }}>No lines yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
            <Button startIcon={<AddIcon />} onClick={addLine} size="small">Add line</Button>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => submit('DRAFT')} disabled={saving}>Save draft</Button>
          <Button variant="contained" onClick={() => submit('REQUESTED')} disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}>
            {saving ? 'Saving…' : 'Submit request'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!cancelId}
        title="Cancel this request?"
        message="The request will be marked cancelled. This can't be undone."
        confirmLabel="Cancel request"
        confirmColor="error"
        onClose={() => setCancelId(null)}
        onConfirm={async () => { if (cancelId) await transition(cancelId, 'cancel'); setCancelId(null) }}
      />
    </Box>
  )
}
