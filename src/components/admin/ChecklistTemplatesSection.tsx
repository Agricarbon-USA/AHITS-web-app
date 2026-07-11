'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Stack, IconButton, Tooltip, CircularProgress, MenuItem, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Card, CardContent,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { DEFAULT_DAILY_CHECKLIST } from '@/types'
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS } from '@/lib/vehicle-types'

// "" = general override (applies to all vehicle types)
const VEHICLE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All vehicle types (general)' },
  ...VEHICLE_TYPES.map((v) => ({ value: v, label: VEHICLE_TYPE_LABELS[v] })),
]
const typeLabel = (v: string | null) =>
  VEHICLE_TYPE_OPTIONS.find((o) => o.value === (v ?? ''))?.label ?? v ?? 'General'

interface TemplateItem { key?: string; label: string }
interface Template {
  id: string
  name: string
  vehicleType: string | null
  items: TemplateItem[]
  isActive: boolean
}

interface FormState {
  id: string | null
  name: string
  vehicleType: string
  items: TemplateItem[]
  isActive: boolean
}

const emptyForm: FormState = { id: null, name: '', vehicleType: '', items: [], isActive: true }

export function ChecklistTemplatesSection({
  onToast, onError,
}: { onToast: (m: string) => void; onError: (m: string) => void }) {
  const [templates, setTemplates] = React.useState<Template[]>([])
  const [loading, setLoading] = React.useState(true)
  const [form, setForm] = React.useState<FormState | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [toDelete, setToDelete] = React.useState<Template | null>(null)
  const [newItemLabel, setNewItemLabel] = React.useState('')

  const load = React.useCallback(async () => {
    try {
      const res = await fetch('/api/checklist-templates')
      if (!res.ok) return
      const { data } = await res.json()
      setTemplates(Array.isArray(data) ? data : [])
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const openAdd = () => { setNewItemLabel(''); setForm({ ...emptyForm }) }
  const openEdit = (t: Template) => {
    setNewItemLabel('')
    setForm({ id: t.id, name: t.name, vehicleType: t.vehicleType ?? '', items: t.items.map((i) => ({ ...i })), isActive: t.isActive })
  }
  const prefillDefault = () => {
    if (!form) return
    setForm({ ...form, items: DEFAULT_DAILY_CHECKLIST.map((i) => ({ key: i.key, label: i.label })) })
  }

  const addItem = () => {
    if (!form || !newItemLabel.trim()) return
    setForm({ ...form, items: [...form.items, { label: newItemLabel.trim() }] })
    setNewItemLabel('')
  }
  const removeItem = (idx: number) => {
    if (!form) return
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })
  }
  const moveItem = (idx: number, dir: -1 | 1) => {
    if (!form) return
    const next = [...form.items]
    const j = idx + dir
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setForm({ ...form, items: next })
  }
  const editItemLabel = (idx: number, label: string) => {
    if (!form) return
    setForm({ ...form, items: form.items.map((it, i) => (i === idx ? { ...it, label } : it)) })
  }

  const save = async () => {
    if (!form) return
    if (!form.name.trim()) { onError('Name is required'); return }
    if (form.items.length === 0 || form.items.some((i) => !i.label.trim())) {
      onError('Add at least one item, and give every item a label'); return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        vehicleType: form.vehicleType === '' ? null : form.vehicleType,
        items: form.items.map((i) => ({ key: i.key, label: i.label.trim() })),
        ...(form.id ? { isActive: form.isActive } : {}),
      }
      const res = await fetch(form.id ? `/api/checklist-templates/${form.id}` : '/api/checklist-templates', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        const msg = d.error?.fieldErrors
          ? (Object.values(d.error.fieldErrors).flat()[0] as string)
          : (d.error?.formErrors?.[0] ?? (typeof d.error === 'string' ? d.error : 'Could not save checklist'))
        onError(msg)
        return
      }
      onToast(form.id ? 'Checklist updated' : 'Checklist added')
      setForm(null)
      load()
    } catch {
      onError('Could not save checklist')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    const res = await fetch(`/api/checklist-templates/${toDelete.id}`, { method: 'DELETE' })
    setToDelete(null)
    if (res.ok) { onToast('Checklist deleted'); load() }
    else onError('Could not delete checklist')
  }

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
          <Typography variant="h6" fontWeight={600}>Daily-Check Checklists</Typography>
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openAdd}>Add Checklist</Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Custom inspection items per vehicle type. Operators see the matching active checklist;
          vehicles with no custom checklist use the built-in {DEFAULT_DAILY_CHECKLIST.length}-item default.
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 600, color: 'text.secondary', fontSize: 12 } }}>
                <TableCell>NAME</TableCell>
                <TableCell>VEHICLE TYPE</TableCell>
                <TableCell align="center">ITEMS</TableCell>
                <TableCell align="center">STATUS</TableCell>
                <TableCell align="right">ACTIONS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id} sx={{ '&:last-child td': { border: 0 } }}>
                  <TableCell><Typography variant="body2">{t.name}</Typography></TableCell>
                  <TableCell><Typography variant="body2">{typeLabel(t.vehicleType)}</Typography></TableCell>
                  <TableCell align="center"><Typography variant="body2">{t.items.length}</Typography></TableCell>
                  <TableCell align="center">
                    <Chip size="small" label={t.isActive ? 'Active' : 'Inactive'} color={t.isActive ? 'success' : 'default'} />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(t)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setToDelete(t)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && templates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No custom checklists — all vehicles use the built-in default.
                  </TableCell>
                </TableRow>
              )}
              {loading && (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3 }}><CircularProgress size={20} /></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>

      {/* Add / Edit dialog */}
      <Dialog open={!!form} onClose={() => setForm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{form?.id ? 'Edit Checklist' : 'Add Checklist'}</DialogTitle>
        <DialogContent>
          {form && (
            <Stack spacing={2} mt={1}>
              <TextField label="Checklist name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth autoFocus />
              <TextField select label="Applies to" value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })} fullWidth>
                {VEHICLE_TYPE_OPTIONS.map((o) => <MenuItem key={o.value || 'all'} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
              {form.id && (
                <TextField select label="Status" value={form.isActive ? 'active' : 'inactive'} onChange={(e) => setForm({ ...form, isActive: e.target.value === 'active' })} fullWidth>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </TextField>
              )}

              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle2">Items ({form.items.length})</Typography>
                <Button size="small" onClick={prefillDefault}>Start from default {DEFAULT_DAILY_CHECKLIST.length}</Button>
              </Stack>

              <Stack spacing={0.5}>
                {form.items.map((it, idx) => (
                  <Stack key={idx} direction="row" spacing={0.5} alignItems="center">
                    <Typography variant="caption" color="text.secondary" sx={{ width: 20, textAlign: 'right' }}>{idx + 1}.</Typography>
                    <TextField size="small" value={it.label} onChange={(e) => editItemLabel(idx, e.target.value)} fullWidth />
                    <IconButton size="small" onClick={() => moveItem(idx, -1)} disabled={idx === 0}><ArrowUpwardIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => moveItem(idx, 1)} disabled={idx === form.items.length - 1}><ArrowDownwardIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={() => removeItem(idx)}><DeleteIcon fontSize="small" /></IconButton>
                  </Stack>
                ))}
                {form.items.length === 0 && (
                  <Typography variant="body2" color="text.secondary">No items yet — add one below or start from the default.</Typography>
                )}
              </Stack>

              <Stack direction="row" spacing={1}>
                <TextField
                  size="small" label="New item label" value={newItemLabel}
                  onChange={(e) => setNewItemLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                  fullWidth
                />
                <Button onClick={addItem} disabled={!newItemLabel.trim()} startIcon={<AddIcon />}>Add</Button>
              </Stack>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setForm(null)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}>
            {saving ? 'Saving…' : form?.id ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        title={`Delete "${toDelete?.name ?? ''}"?`}
        message="Vehicles of this type will fall back to the built-in default checklist."
        confirmLabel="Delete"
        confirmColor="error"
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
      <Box />
    </Card>
  )
}
