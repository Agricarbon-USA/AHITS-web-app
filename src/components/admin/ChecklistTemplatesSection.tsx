'use client'

import * as React from 'react'
import {
  Box, Typography, Button, TextField, Stack, IconButton, Tooltip, CircularProgress, MenuItem, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Card, CardContent,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EntityFormDialog, RequiredLegend } from '@/components/ui/EntityFormDialog'
import { useDirtyState } from '@/hooks/useDirtyState'
import { parseApiError } from '@/lib/api-error-shape'
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

const formFrom = (t: Template): FormState =>
  ({ id: t.id, name: t.name, vehicleType: t.vehicleType ?? '', items: t.items.map((i) => ({ ...i })), isActive: t.isActive })

/**
 * The ACTIVE template a vehicle type runs. The list is ordered `isActive DESC,
 * vehicleType, updatedAt DESC` (lib/checklist-templates listChecklistTemplates), so
 * the first active hit is the one `resolveChecklistItems` picks — T7's "newest
 * edited wins". Exported for the page test.
 */
export function activeTemplateFor(type: string, templates: Template[]): Template | null {
  return templates.find((t) => t.isActive && (t.vehicleType ?? '') === type) ?? null
}

/** UXP-6 (6e): the other ACTIVE templates that cover the same type as `form` (T7). */
function activeRivals(form: FormState, templates: Template[]): Template[] {
  if (!form.isActive) return []
  return templates.filter((t) => t.isActive && t.id !== form.id && (t.vehicleType ?? '') === form.vehicleType)
}

export function ChecklistTemplatesSection({
  onToast, onError, deepLinkType = null,
}: {
  onToast: (m: string) => void
  onError: (m: string) => void
  /**
   * UXP-6 (6e): `?checklist=` from the Vehicles page. `null` = no deep link; `''` =
   * land on this card; a vehicle type = open the editor on that type's ACTIVE
   * template, or a new one prefilled with the type. Handled once per value, after
   * the list has loaded (so the target is the real active template, not a guess).
   */
  deepLinkType?: string | null
}) {
  const [templates, setTemplates] = React.useState<Template[]>([])
  const [loading, setLoading] = React.useState(true)
  const [form, setForm] = React.useState<FormState | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [toDelete, setToDelete] = React.useState<Template | null>(null)
  const [newItemLabel, setNewItemLabel] = React.useState('')
  // Inline validation (6a grammar): name on the field, items as the form-level Alert.
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [formError, setFormError] = React.useState<string | null>(null)
  // T7: the other active template(s) for this type, pending the admin's Continue.
  const [rivals, setRivals] = React.useState<Template[] | null>(null)
  const cardRef = React.useRef<HTMLDivElement | null>(null)

  const dirty = useDirtyState(!!form, { form, newItemLabel })

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

  const openForm = (next: FormState) => {
    setNewItemLabel('')
    setNameError(null)
    setFormError(null)
    setRivals(null)
    setForm(next)
  }
  const openAdd = () => openForm({ ...emptyForm })
  const openEdit = (t: Template) => openForm(formFrom(t))
  // UXP-6 (6e): Duplicate — create mode from an existing list ("<name> (copy)"). A
  // copy of an active list is itself active, so saving it as-is trips the T7 warning.
  const openDuplicate = (t: Template) => openForm({ ...formFrom(t), id: null, name: `${t.name} (copy)`, isActive: true })

  // Deep link (?checklist=<TYPE>): consumed once per value, once the list is in.
  // React's "adjust state during render" pattern (same as EntityFormDialog) rather
  // than an effect — no cascading setState-in-effect, and it runs whichever arrives
  // last: the URL param (hydration / client navigation) or the fetched list.
  const [handledDeepLink, setHandledDeepLink] = React.useState<string | null>(null)
  if (deepLinkType !== null && deepLinkType !== handledDeepLink && !loading) {
    setHandledDeepLink(deepLinkType)
    const type = (VEHICLE_TYPES as readonly string[]).includes(deepLinkType) ? deepLinkType : ''
    if (type) {
      const active = activeTemplateFor(type, templates)
      openForm(active ? formFrom(active) : { ...emptyForm, vehicleType: type })
    }
  }
  // Bare `?checklist=` (the Vehicles toolbar): bring this card into view — it is the
  // fourth card on Settings. DOM-only, so an effect is the right tool.
  React.useEffect(() => {
    if (deepLinkType === null) return
    const el = cardRef.current
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [deepLinkType])

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

  // Validation → (T7 warning) → request. Returns `false` so EntityFormDialog scrolls
  // to the first invalid field; the warning path returns undefined (nothing to scroll).
  const submit = async () => {
    if (!form) return
    let ok = true
    if (!form.name.trim()) { setNameError('Name is required'); ok = false }
    if (form.items.length === 0 || form.items.some((i) => !i.label.trim())) {
      setFormError('Add at least one item, and give every item a label'); ok = false
    }
    if (!ok) return false
    setNameError(null)
    setFormError(null)
    const others = activeRivals(form, templates)
    if (others.length > 0) { setRivals(others); return }
    await performSave(form)
  }

  const performSave = async (f: FormState) => {
    setSaving(true)
    try {
      const payload = {
        name: f.name.trim(),
        vehicleType: f.vehicleType === '' ? null : f.vehicleType,
        items: f.items.map((i) => ({ key: i.key, label: i.label.trim() })),
        ...(f.id ? { isActive: f.isActive } : {}),
      }
      const res = await fetch(f.id ? `/api/checklist-templates/${f.id}` : '/api/checklist-templates', {
        method: f.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        const parsed = parseApiError(body, 'Could not save checklist')
        setNameError(parsed.fieldErrors.name ?? null)
        const rest = Object.entries(parsed.fieldErrors).find(([k]) => k !== 'name')?.[1] ?? null
        setFormError(parsed.formError ?? rest)
        return
      }
      onToast(f.id ? `${payload.name} updated` : `${payload.name} added`)
      setForm(null)
      load()
    } catch {
      setFormError('Could not save checklist')
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

  const rivalMessage = (others: Template[], f: FormState) => {
    const covers = f.vehicleType ? VEHICLE_TYPE_LABELS[f.vehicleType as keyof typeof VEHICLE_TYPE_LABELS] ?? f.vehicleType : 'all vehicle types'
    const names = others.map((t) => `“${t.name}”`).join(', ')
    return `Another active checklist already covers ${covers} — the most recently edited one wins. Deactivate the other or continue. Also active: ${names}.`
  }

  return (
    <Card sx={{ mb: 3 }} ref={cardRef} id="checklists">
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
                      <Tooltip title="Duplicate"><IconButton size="small" onClick={() => openDuplicate(t)}><ContentCopyIcon fontSize="small" /></IconButton></Tooltip>
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

      {/* Add / Edit / Duplicate — UXP-6 (6e) on the one form grammar (6a). */}
      <EntityFormDialog
        open={!!form}
        title={form?.id ? 'Edit checklist' : 'Add checklist'}
        onClose={() => setForm(null)}
        onSubmit={submit}
        saving={saving}
        submitLabel={form?.id ? 'Save' : 'Add'}
        dirty={dirty}
        formError={formError}
        legend={<RequiredLegend />}
        maxWidth="sm"
      >
        {form && (
          <Stack spacing={2} mt={1}>
            <TextField
              label="Checklist name" value={form.name} fullWidth autoFocus required
              onChange={(e) => { setForm({ ...form, name: e.target.value }); if (nameError) setNameError(null) }}
              error={!!nameError} helperText={nameError}
            />
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
              <Typography variant="subtitle2">
                Items ({form.items.length}) <Box component="span" sx={{ color: 'error.main' }}>*</Box>
              </Typography>
              <Button size="small" onClick={prefillDefault}>Start from default {DEFAULT_DAILY_CHECKLIST.length}</Button>
            </Stack>

            <Stack spacing={0.5}>
              {form.items.map((it, idx) => (
                <Stack key={idx} direction="row" spacing={0.5} alignItems="center">
                  <Typography variant="caption" color="text.secondary" sx={{ width: 20, textAlign: 'right' }}>{idx + 1}.</Typography>
                  <TextField
                    size="small" value={it.label} fullWidth
                    onChange={(e) => { editItemLabel(idx, e.target.value); if (formError) setFormError(null) }}
                    error={!!formError && !it.label.trim()}
                    inputProps={{ 'aria-label': `Item ${idx + 1}` }}
                  />
                  <IconButton size="small" onClick={() => moveItem(idx, -1)} disabled={idx === 0} aria-label={`Move item ${idx + 1} up`}><ArrowUpwardIcon fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => moveItem(idx, 1)} disabled={idx === form.items.length - 1} aria-label={`Move item ${idx + 1} down`}><ArrowDownwardIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => removeItem(idx)} aria-label={`Remove item ${idx + 1}`}><DeleteIcon fontSize="small" /></IconButton>
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
                // Enter here adds the item (never submits the form).
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                fullWidth
              />
              <Button onClick={addItem} disabled={!newItemLabel.trim()} startIcon={<AddIcon />}>Add item</Button>
            </Stack>
          </Stack>
        )}
      </EntityFormDialog>

      {/* T7: two active templates for one type → the newest-edited silently wins. Say so. */}
      <ConfirmDialog
        open={!!rivals && !!form}
        title="Another checklist is already active"
        message={rivals && form ? rivalMessage(rivals, form) : ''}
        confirmLabel="Continue"
        confirmColor="warning"
        onClose={() => setRivals(null)}
        onConfirm={async () => {
          const f = form
          setRivals(null)
          if (f) await performSave(f)
        }}
      />

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
