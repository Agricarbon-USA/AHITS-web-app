'use client'

import * as React from 'react'
import {
  Box, Typography, Paper, Stack, Button, IconButton, CircularProgress, Chip, Divider,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Drawer, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Tooltip,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CloseIcon from '@mui/icons-material/Close'
import { useToast } from '@/components/shared/useToast'

const PROJECT_TYPES = ['CROPLAND', 'RANGELAND', 'FORESTRY', 'OTHER']
const PROJECT_STATUSES = ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']

type ChipColor = 'default' | 'success' | 'warning' | 'info' | 'error'
const STATUS_COLOR: Record<string, ChipColor> = {
  PLANNED: 'default',
  ACTIVE: 'success',
  ON_HOLD: 'warning',
  COMPLETED: 'info',
  CANCELLED: 'error',
}

interface ProjectRow {
  id: string
  name: string
  type: string
  location: string | null
  startDate: string | null
  endDate: string | null
  status: string
  notes: string | null
  lead: { id: string; name: string } | null
  _count?: { rigs: number }
}

interface ProjectDetail extends ProjectRow {
  rigs: { id: string; label: string | null; startedAt: string; endedAt: string | null; operator: { id: string; name: string } | null }[]
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—')
const dateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '')

function StatusPill({ status }: { status: string }) {
  return <Chip size="small" label={status.replace(/_/g, ' ')} color={STATUS_COLOR[status] ?? 'default'} variant={status === 'PLANNED' ? 'outlined' : 'filled'} />
}

export default function AdminProjectsPage() {
  const showToast = useToast()
  const [projects, setProjects] = React.useState<ProjectRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [detail, setDetail] = React.useState<ProjectDetail | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ProjectRow | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<ProjectRow | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/projects')
      if (!res.ok) { showToast({ message: 'Failed to load projects', severity: 'error' }); return }
      const d = await res.json()
      setProjects(d.data ?? [])
    } catch {
      showToast({ message: 'Failed to load projects', severity: 'error' })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  React.useEffect(() => { load() }, [load])

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    setDetail(null)
    try {
      const res = await fetch(`/api/projects/${id}`)
      if (!res.ok) { showToast({ message: 'Failed to load project', severity: 'error' }); return }
      const d = await res.json()
      setDetail(d.data)
    } finally {
      setDetailLoading(false)
    }
  }

  const doDelete = async () => {
    if (!confirmDelete) return
    const res = await fetch(`/api/projects/${confirmDelete.id}`, { method: 'DELETE' })
    if (res.ok) {
      showToast({ message: `${confirmDelete.name} deleted`, severity: 'success' })
      setConfirmDelete(null)
      setDetail(null)
      load()
    } else {
      const d = await res.json().catch(() => ({}))
      showToast({ message: typeof d.error === 'string' ? d.error : 'Delete failed', severity: 'error' })
    }
  }

  const activeRigs = (p: ProjectDetail) => p.rigs.filter((r) => !r.endedAt).length

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} mb={2}>
        <Typography variant="h5">Projects</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setFormOpen(true) }}>
          Add Project
        </Button>
      </Stack>

      <Paper variant="outlined">
        {loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>
        ) : projects.length === 0 ? (
          <Box sx={{ p: 4 }}><Typography color="text.secondary" align="center">No projects yet. Add your first project to organize deployments.</Typography></Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Dates</TableCell>
                  <TableCell>Lead</TableCell>
                  <TableCell align="right">Deployments</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {projects.map((p) => (
                  <TableRow key={p.id} hover sx={{ cursor: 'pointer' }} onClick={() => openDetail(p.id)}>
                    <TableCell><Typography variant="body2" fontWeight={500}>{p.name}</Typography></TableCell>
                    <TableCell>{p.type.replace(/_/g, ' ')}</TableCell>
                    <TableCell><StatusPill status={p.status} /></TableCell>
                    <TableCell>{p.location ?? '—'}</TableCell>
                    <TableCell>{p.startDate || p.endDate ? `${fmt(p.startDate)} – ${fmt(p.endDate)}` : '—'}</TableCell>
                    <TableCell>{p.lead?.name ?? '—'}</TableCell>
                    <TableCell align="right">{p._count?.rigs ?? 0}</TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => { setEditing(p); setFormOpen(true) }}><EditIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton size="small" onClick={() => setConfirmDelete(p)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Drawer anchor="right" open={!!detail || detailLoading} onClose={() => setDetail(null)} PaperProps={{ sx: { width: { xs: '100%', sm: 440 }, p: 2 } }}>
        {detailLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>
        ) : detail ? (
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="h6">{detail.name}</Typography>
              <IconButton size="small" onClick={() => setDetail(null)}><CloseIcon /></IconButton>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <StatusPill status={detail.status} />
              <Chip size="small" label={detail.type.replace(/_/g, ' ')} variant="outlined" />
              {detail.location && <Chip size="small" label={detail.location} variant="outlined" />}
            </Stack>

            <Stack spacing={0.5}>
              <Row label="Lead" value={detail.lead?.name ?? '—'} />
              <Row label="Start" value={fmt(detail.startDate)} />
              <Row label="End" value={fmt(detail.endDate)} />
            </Stack>
            {detail.notes && <Box><Typography variant="subtitle2" gutterBottom>Notes</Typography><Typography variant="body2" color="text.secondary">{detail.notes}</Typography></Box>}

            <Divider />
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Deployments ({detail.rigs.length}{detail.rigs.length > 0 ? ` · ${activeRigs(detail)} active` : ''})
              </Typography>
              {detail.rigs.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No deployments assigned to this project yet.</Typography>
              ) : (
                <Stack spacing={0.75}>
                  {detail.rigs.map((r) => (
                    <Stack key={r.id} direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                      <Box flexGrow={1}>
                        <Typography variant="body2">{r.operator?.name ?? 'Unassigned'}{r.label ? ` · ${r.label}` : ''}</Typography>
                        <Typography variant="caption" color="text.secondary">Started {fmt(r.startedAt)}</Typography>
                      </Box>
                      <Chip size="small" label={r.endedAt ? 'Ended' : 'Active'} color={r.endedAt ? 'default' : 'success'} variant={r.endedAt ? 'outlined' : 'filled'} />
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>

            <Stack direction="row" spacing={1} pt={1}>
              <Button variant="outlined" startIcon={<EditIcon />} onClick={() => { setEditing(detail); setFormOpen(true) }}>Edit</Button>
              <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => setConfirmDelete(detail)}>Delete</Button>
            </Stack>
          </Stack>
        ) : null}
      </Drawer>

      {formOpen && (
        <ProjectFormDialog
          project={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); load(); if (detail) openDetail(detail.id) }}
          showToast={showToast}
        />
      )}

      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete project</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{confirmDelete?.name}</strong>? Projects with assigned deployments can&rsquo;t be deleted until those are reassigned or ended.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={doDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={500} textAlign="right">{value}</Typography>
    </Stack>
  )
}

type ShowToast = (t: { message: string; severity?: 'success' | 'error' | 'warning' | 'info' }) => void

function ProjectFormDialog({ project, onClose, onSaved, showToast }: {
  project: ProjectRow | null
  onClose: () => void
  onSaved: () => void
  showToast: ShowToast
}) {
  const isEdit = !!project
  const [name, setName] = React.useState(project?.name ?? '')
  const [type, setType] = React.useState(project?.type ?? 'CROPLAND')
  const [status, setStatus] = React.useState(project?.status ?? 'PLANNED')
  const [location, setLocation] = React.useState(project?.location ?? '')
  const [startDate, setStartDate] = React.useState(dateInput(project?.startDate))
  const [endDate, setEndDate] = React.useState(dateInput(project?.endDate))
  const [notes, setNotes] = React.useState(project?.notes ?? '')
  const [saving, setSaving] = React.useState(false)

  const save = async () => {
    if (!name.trim()) { showToast({ message: 'Name is required', severity: 'error' }); return }
    setSaving(true)
    try {
      let res: Response
      if (isEdit) {
        res = await fetch(`/api/projects/${project!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name, type, status,
            location: location || null,
            startDate: startDate || null,
            endDate: endDate || null,
            notes: notes || null,
          }),
        })
      } else {
        res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name, type, status,
            ...(location ? { location } : {}),
            ...(startDate ? { startDate } : {}),
            ...(endDate ? { endDate } : {}),
            ...(notes ? { notes } : {}),
          }),
        })
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Save failed', severity: 'error' })
        return
      }
      showToast({ message: isEdit ? 'Project updated' : 'Project added', severity: 'success' })
      onSaved()
    } catch {
      showToast({ message: 'Save failed', severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? `Edit ${project!.name}` : 'Add Project'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth required />
          <Stack direction="row" spacing={2}>
            <TextField select label="Type" value={type} onChange={(e) => setType(e.target.value)} fullWidth>
              {PROJECT_TYPES.map((t) => <MenuItem key={t} value={t}>{t.replace(/_/g, ' ')}</MenuItem>)}
            </TextField>
            <TextField select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} fullWidth>
              {PROJECT_STATUSES.map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField label="Location" value={location} onChange={(e) => setLocation(e.target.value)} fullWidth />
          <Stack direction="row" spacing={2}>
            <TextField label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
            <TextField label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
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
