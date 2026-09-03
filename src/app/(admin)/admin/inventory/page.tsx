'use client'

import * as React from 'react'
import { useUrlFilters } from '@/hooks/useUrlFilters'
import {
  Box, Typography, Button, TextField, MenuItem, Stack, Alert,
  Chip, IconButton, Tooltip, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Skeleton, Switch, FormControlLabel, Accordion, AccordionSummary,
  AccordionDetails, Divider, TablePagination,
  FormControl, FormLabel, RadioGroup, Radio, Link, Tabs, Tab,
} from '@mui/material'
import { StatusChip } from '@/components/shared/StatusChip'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { EntityFormDialog, RequiredLegend } from '@/components/ui/EntityFormDialog'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { useDirtyState } from '@/hooks/useDirtyState'
import { parseApiError, apiErrorMessage, humanizeField } from '@/lib/api-error-shape'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import ArchiveIcon from '@mui/icons-material/Archive'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import DownloadIcon from '@mui/icons-material/Download'
import HistoryIcon from '@mui/icons-material/History'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import QRCode from 'qrcode'
import { useToast } from '@/components/shared/useToast'
import { QrScanField } from '@/components/shared/QrScanField'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PhotoGallery } from '@/components/shared/PhotoGallery'
import { RepairReviewDialog } from '@/components/shared/RepairReviewDialog'
import { EQUIPMENT_STATUS } from '@/lib/status'
import { useCanEdit, EditGuard, MutationButton, MutationIconButton } from '@/components/shared/ReadOnly'
import { groupBy, formatDate } from '@/lib/utils'

// FND-48: URL-persisted filter keys for the inventory list (stable object so the
// useUrlFilters setter callback stays referentially stable).
const INVENTORY_FILTER_DEFAULTS = { categoryId: '', itemType: '', hubId: '', operatorId: '', projectId: '' }

// ── Types ─────────────────────────────────────────────────────────

interface CategoryOption { id: string; name: string }
interface HubOption { id: string; name: string; city: string; state: string }

interface UnitRow {
  id: string
  qrCodeId: string
  serialNumber: string | null
  status: string
  notes: string | null
  createdAt: string
}

interface UnitCounts {
  totalUnits: number
  available: number
  checkedOut: number
  inMaintenance: number
  inoperable: number
  retired: number
}

interface InventoryItemRow {
  id: string
  name: string
  category: { id: string; name: string }
  hub: { id: string; name: string; city: string; state: string } | null
  sku: string | null
  quantity: number
  unitCost: string | null
  reorderUrl: string | null
  supplier: string | null
  location: string | null
  qrCodeId: string
  notes: string | null
  lowStockThreshold: number | null
  itemType: string
  unitId: string | null
  expectedQuantity: number | null
  createdAt: string
  updatedAt: string
  currentOperator: { id: string; name: string } | null
  currentProject: { id: string; name: string; location: string | null } | null
  activeProjects?: { id: string; name: string }[]
  unitCounts: UnitCounts
  units: UnitRow[]
  derivedQuantity: number
  availableQuantity: number
}

interface CheckLogEntry {
  id: string
  action: string
  condition: string | null
  submittedAt: string
  inventoryUnitId: string | null
  operator: { id: string; name: string } | null
}

interface PhotoEntry {
  id: string
  url: string
  context: string
}

interface ItemDetail extends InventoryItemRow {
  checkLogs: CheckLogEntry[]
  photos: PhotoEntry[]
  inoperableNotes?: string | null
}

interface UserOption { id: string; name: string; role: string }
interface ProjectOption { id: string; name: string }

interface HubStockRow {
  hubId: string
  hubName: string | null
  quantity: number
  reservedQty: number
  available: number
}

// ── Confirm Dialog ────────────────────────────────────────────────

// RepairReviewDialog now lives in components/shared/RepairReviewDialog.tsx (UX-13).

// ── Item Form Dialog ──────────────────────────────────────────────

// UXP-6 (6c): the item form on EntityFormDialog (plan §2 "Item → units → hub stock").
//  - T4: a SERIALIZED create asks for "Units to create" (0–200) plus optional serial
//    numbers and creates them with `POST /api/inventory/<id>/units` right after the
//    201 (the old "Initial Quantity" created zero units). If that second call fails
//    the item still exists, so the page opens its drawer on the Units tab with the
//    error — and the serials typed — instead of losing anything.
//  - T5: a CONSUMABLE with an initial quantity above 0 needs a hub (field error, no
//    POST): the server seeds the per-hub stock row only when hub AND qty are set,
//    and a hub-less count is later overwritten by the first stock resync.
//  - T6: on edit, a cleared nullable field is sent as `null` (the PATCH schema is
//    nullable); hub/category stay omitted because the server cannot un-set them.
//  - Inline field errors via parseApiError (was a raw JSON.stringify Alert), the
//    one required legend, SearchableSelect for category/hub (hub label
//    `name · city, state`), dirty guard, "Save & add another" with sticky
//    type/category/hub, and a "<name> added · Open" toast (wired by the page).

interface ItemFormValues {
  name: string
  itemType: string
  unitId: string
  categoryId: string
  hubId: string
  /** Create only: initial stock (consumable) or units to create (serialized). */
  quantity: string
  /** Create only, serialized: one serial per line, applied positionally. */
  serialNumbers: string
  expectedQuantity: string
  lowStockThreshold: string
  unitCost: string
  supplier: string
  reorderUrl: string
  notes: string
}

/** Mirrors the units route's zod (`count ≤ 200`). */
const MAX_UNITS_PER_CREATE = 200

const EMPTY_ITEM_FORM: ItemFormValues = {
  name: '', itemType: 'CONSUMABLE', unitId: '', categoryId: '', hubId: '', quantity: '1', serialNumbers: '',
  expectedQuantity: '', lowStockThreshold: '', unitCost: '', supplier: '', reorderUrl: '', notes: '',
}

function itemFormValues(item: InventoryItemRow | null): ItemFormValues {
  if (!item) return EMPTY_ITEM_FORM
  return {
    name: item.name,
    itemType: item.itemType,
    unitId: item.unitId ?? '',
    // Only a real CUID, not an enum fallback like 'SAMPLING_EQUIPMENT'
    categoryId: /^[A-Z_]+$/.test(item.category.id) ? '' : item.category.id,
    hubId: item.hub?.id ?? '',
    quantity: String(item.quantity),
    serialNumbers: '',
    expectedQuantity: item.expectedQuantity != null ? String(item.expectedQuantity) : '',
    lowStockThreshold: item.lowStockThreshold != null ? String(item.lowStockThreshold) : '',
    unitCost: item.unitCost != null ? String(item.unitCost) : '',
    supplier: item.supplier ?? '',
    reorderUrl: item.reorderUrl ?? '',
    notes: item.notes ?? '',
  }
}

/** One hub label everywhere (plan §2): `name · city, state`. */
function hubOptionLabel(h: HubOption): string {
  return `${h.name} · ${h.city}, ${h.state}`
}

/** "Serial numbers (one per line)" → trimmed, non-empty lines, in order. */
function parseSerialLines(text: string): string[] {
  return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
}

/** What the page needs after a save: the item (for the toast's Open action) and how it went. */
interface ItemSaved {
  id: string
  name: string
}
interface ItemSavedInfo {
  isEdit: boolean
  /** "Save & add another": the dialog stays open, the page only toasts + reloads. */
  keepOpen: boolean
  /** T4: the item exists but its units were not created — open the drawer on Units with this. */
  unitsError: string | null
}

const PURCHASING_FIELDS = ['unitCost', 'supplier', 'reorderUrl'] as const
const ITEM_FORM_FIELDS = new Set<string>([
  'name', 'itemType', 'unitId', 'categoryId', 'hubId', 'quantity', 'serialNumbers',
  'expectedQuantity', 'lowStockThreshold', ...PURCHASING_FIELDS, 'notes',
])

function ItemFormDialog({
  item, categories, hubs, onClose, onSaved,
}: {
  item: InventoryItemRow | null; categories: CategoryOption[]; hubs: HubOption[]
  onClose: () => void; onSaved: (saved: ItemSaved, info: ItemSavedInfo) => void
}) {
  const isEdit = !!item
  // The page mounts this dialog per open (and keys it by item), so the initial
  // values come straight from the item — no reset effect, no stale first render.
  const [values, setValues] = React.useState<ItemFormValues>(() => itemFormValues(item))
  // Re-based after "Save & add another" so the sticky fields do not read as dirty.
  const [initial, setInitial] = React.useState<ItemFormValues>(values)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [purchasingOpen, setPurchasingOpen] = React.useState(false)
  const nameRef = React.useRef<HTMLInputElement | null>(null)
  // "Save & add another" flips this and submits the form; handleSubmit reads + resets
  // it. The secondary is `type="button"` on purpose: as a submit button rendered before
  // the primary it would be the form's DEFAULT button, so Enter in any field would
  // trigger add-another instead of "Add item".
  const intentRef = React.useRef<'add-another' | null>(null)
  const dirty = useDirtyState(true, values, initial)

  const isSerialized = values.itemType === 'SERIALIZED'
  const serials = React.useMemo(() => parseSerialLines(values.serialNumbers), [values.serialNumbers])
  // A blank quantity means 0 (as the old form's `parseInt(v) || 0` did) — not an error.
  const qty = values.quantity.trim() === '' ? 0 : parseInt(values.quantity, 10)

  const setField = <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    // Typing into a field clears its error; the next submit re-validates.
    setFieldErrors((fe) => {
      if (!fe[key]) return fe
      const next = { ...fe }
      delete next[key]
      return next
    })
  }

  const applyFieldErrors = (errs: Record<string, string>) => {
    setFieldErrors(errs)
    if (PURCHASING_FIELDS.some((k) => errs[k])) setPurchasingOpen(true)
  }

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {}
    if (!values.name.trim()) errs.name = 'Name is required'
    if (!isEdit && !values.categoryId) errs.categoryId = 'Category is required'
    if (!isEdit) {
      if (isSerialized) {
        if (!Number.isInteger(qty) || qty < 0 || qty > MAX_UNITS_PER_CREATE) {
          errs.quantity = `Enter 0–${MAX_UNITS_PER_CREATE} units`
        } else if (serials.length > qty) {
          errs.serialNumbers = `${serials.length} serial numbers listed but only ${qty} unit${qty === 1 ? '' : 's'} to create — raise the count or remove a line`
        }
      } else if (!Number.isInteger(qty) || qty < 0) {
        errs.quantity = 'Enter 0 or more'
      } else if (qty > 0 && !values.hubId) {
        // T5: without a hub the server stores the count on the item only; the first
        // per-hub stock write then resyncs it away and pickers show 0 until then.
        errs.hubId = 'Pick a hub — stock above 0 has to land at a hub'
      }
    }
    return errs
  }

  const buildBody = (): Record<string, unknown> => {
    const v = values
    const body: Record<string, unknown> = { name: v.name.trim(), categoryId: v.categoryId, itemType: v.itemType }
    // The PATCH whitelist deliberately excludes the legacy unitId helper (strict schema).
    if (!isEdit && isSerialized && v.unitId) body.unitId = v.unitId
    if (v.hubId) body.hubId = v.hubId
    if (isEdit) {
      // T6: nullable on PATCH — a cleared field is sent as null, not dropped.
      body.expectedQuantity = v.expectedQuantity === '' ? null : parseInt(v.expectedQuantity, 10)
      body.lowStockThreshold = v.lowStockThreshold === '' ? null : parseInt(v.lowStockThreshold, 10)
      body.unitCost = v.unitCost === '' ? null : parseFloat(v.unitCost)
      body.supplier = v.supplier || null
      body.reorderUrl = v.reorderUrl || null
      body.notes = v.notes || null
    } else {
      // Create schema is optional-not-nullable: omit blanks, as before.
      body.quantity = qty
      if (v.expectedQuantity !== '') body.expectedQuantity = parseInt(v.expectedQuantity, 10)
      if (v.lowStockThreshold !== '') body.lowStockThreshold = parseInt(v.lowStockThreshold, 10)
      if (v.unitCost !== '') body.unitCost = parseFloat(v.unitCost)
      if (v.supplier) body.supplier = v.supplier
      if (v.reorderUrl) body.reorderUrl = v.reorderUrl
      if (v.notes) body.notes = v.notes
    }
    return body
  }

  /** T4 second call: create the units for a brand-new serialized item. Null = fine, else the notice. */
  const createUnits = async (itemId: string): Promise<string | null> => {
    const describe = (reason: string) =>
      `The item was added, but its ${qty} unit${qty === 1 ? '' : 's'} could not be created (${reason}). ` +
      `Add ${qty === 1 ? 'it' : 'them'} below${serials.length ? ` — serials: ${serials.join(', ')}` : ''}.`
    try {
      const res = await fetch(`/api/inventory/${itemId}/units`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: qty, ...(serials.length ? { serialNumbers: serials } : {}) }),
      })
      if (res.ok) return null
      const d = await res.json().catch(() => ({}))
      return describe(apiErrorMessage(d, 'the server rejected the request'))
    } catch {
      return describe('network error')
    }
  }

  const resetForAnother = () => {
    // Sticky: type, category, hub. Everything else starts over.
    const next: ItemFormValues = { ...EMPTY_ITEM_FORM, itemType: values.itemType, categoryId: values.categoryId, hubId: values.hubId }
    setValues(next)
    setInitial(next)
    setFieldErrors({})
    setFormError(null)
    setPurchasingOpen(false)
    nameRef.current?.focus()
  }

  const handleSubmit = async () => {
    // Enter / the "Add item" button submit with no intent → the primary path.
    const addAnother = !isEdit && intentRef.current === 'add-another'
    intentRef.current = null
    setFormError(null)
    const errs = validate()
    if (Object.keys(errs).length > 0) { applyFieldErrors(errs); return false }
    setFieldErrors({})
    setSaving(true)
    try {
      const url = item ? `/api/inventory/${item.id}` : '/api/inventory'
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const parsed = parseApiError(data, 'Could not save the item')
        applyFieldErrors(parsed.fieldErrors)
        // A field error with no field on this form would otherwise be invisible.
        const orphan = Object.entries(parsed.fieldErrors).find(([k]) => !ITEM_FORM_FIELDS.has(k))
        setFormError(parsed.formError ?? (orphan ? `${humanizeField(orphan[0])}: ${orphan[1]}` : null))
        return false
      }
      const row = (data as { data?: { id?: string; name?: string } }).data
      const saved: ItemSaved = { id: row?.id ?? item?.id ?? '', name: row?.name ?? values.name.trim() }
      const unitsError = !isEdit && isSerialized && qty > 0 && saved.id ? await createUnits(saved.id) : null
      const keepOpen = addAnother && !unitsError
      onSaved(saved, { isEdit, keepOpen, unitsError })
      if (keepOpen) resetForAnother()
      else onClose()
    } catch {
      setFormError('Network error. Please try again.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const err = (key: keyof ItemFormValues) => fieldErrors[key]
  const hubRequired = !isEdit && !isSerialized && Number.isInteger(qty) && qty > 0

  return (
    <EntityFormDialog
      open
      title={isEdit ? 'Edit item' : 'Add item'}
      onClose={onClose}
      onSubmit={handleSubmit}
      saving={saving}
      dirty={dirty}
      formError={formError}
      legend={<RequiredLegend />}
      submitLabel={isEdit ? 'Save changes' : 'Add item'}
      fullScreenXs
      secondaryAction={!isEdit ? (
        <Button
          type="button"
          disabled={saving}
          onClick={(e) => { intentRef.current = 'add-another'; e.currentTarget.form?.requestSubmit() }}
        >
          Save &amp; add another
        </Button>
      ) : undefined}
    >
      <Stack spacing={2.5} pt={0.5}>
        <TextField label="Name" value={values.name} onChange={(e) => setField('name', e.target.value)} required fullWidth autoFocus
          inputRef={nameRef} error={!!err('name')} helperText={err('name')} />
        <FormControl error={!!err('itemType')}>
          <FormLabel>Item Type</FormLabel>
          <RadioGroup row value={values.itemType} onChange={(e) => setField('itemType', e.target.value)}>
            <FormControlLabel value="CONSUMABLE" control={<Radio />} label="Consumable" />
            <FormControlLabel value="SERIALIZED" control={<Radio />} label="Serialized Item" />
          </RadioGroup>
        </FormControl>
        {isSerialized && (
          <TextField label="Unit / Serial Number" value={values.unitId} onChange={(e) => setField('unitId', e.target.value)} fullWidth
            disabled={isEdit} error={!!err('unitId')}
            helperText={err('unitId') ?? (isEdit ? 'Set when the item was created' : 'e.g. GPS-003, DRILL-01 — this will link to a QR sticker')} />
        )}
        <SearchableSelect
          label="Category"
          value={values.categoryId}
          onChange={(v) => setField('categoryId', v)}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          required={!isEdit}
          error={!!err('categoryId')}
          helperText={err('categoryId') ?? (categories.length === 0
            ? 'No categories set up yet — categories are created automatically when inventory is imported.'
            : undefined)}
        />
        <SearchableSelect
          label="Hub Location"
          value={values.hubId}
          onChange={(v) => setField('hubId', v)}
          options={hubs.map((h) => ({ value: h.id, label: hubOptionLabel(h) }))}
          placeholder="Unknown"
          required={hubRequired}
          error={!!err('hubId')}
          helperText={err('hubId') ?? (!isEdit && !isSerialized ? 'Where the initial stock lands. "Unknown" is fine only when the quantity is 0.' : undefined)}
        />
        {item ? (
          <Box>
            <Typography variant="caption" color="text.secondary">
              {isSerialized ? 'Total Units' : 'Total Stock'}
            </Typography>
            <Typography variant="body2">
              {isSerialized
                ? `${item.unitCounts?.totalUnits ?? item.quantity ?? 0} (managed in Units tab)`
                : `${item.quantity ?? 0} total (managed per hub — use Stock by Hub below)`}
            </Typography>
          </Box>
        ) : isSerialized ? (
          <>
            <TextField label="Units to create" type="number" value={values.quantity} onChange={(e) => setField('quantity', e.target.value)}
              required fullWidth inputProps={{ min: 0, max: MAX_UNITS_PER_CREATE }} error={!!err('quantity')}
              helperText={err('quantity') ?? 'Each unit gets its own QR label. 0 = add units later from the Units tab.'} />
            <TextField label="Serial numbers (one per line)" value={values.serialNumbers} onChange={(e) => setField('serialNumbers', e.target.value)}
              fullWidth multiline minRows={2} error={!!err('serialNumbers')}
              helperText={err('serialNumbers') ?? 'Applied to the new units in order; leave blank to add serials later.'} />
          </>
        ) : (
          <TextField label="Initial Quantity" type="number" value={values.quantity} onChange={(e) => setField('quantity', e.target.value)}
            required fullWidth inputProps={{ min: 0 }} error={!!err('quantity')} helperText={err('quantity')} />
        )}
        <TextField label="Expected / Total Quantity" type="number" value={values.expectedQuantity} onChange={(e) => setField('expectedQuantity', e.target.value)}
          fullWidth inputProps={{ min: 0 }} error={!!err('expectedQuantity')}
          helperText={err('expectedQuantity') ?? 'How many of this item should exist in total? Used to spot shrinkage.'} />
        <TextField label="Low Stock Alert Threshold" type="number" value={values.lowStockThreshold} onChange={(e) => setField('lowStockThreshold', e.target.value)}
          fullWidth inputProps={{ min: 0 }} error={!!err('lowStockThreshold')}
          helperText={err('lowStockThreshold') ?? 'Show a warning when available unit count falls to or below this number.'} />
        <Accordion expanded={purchasingOpen} onChange={(_, expanded) => setPurchasingOpen(expanded)}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2">Purchasing Info</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <TextField label="Unit Cost ($)" type="number" value={values.unitCost} onChange={(e) => setField('unitCost', e.target.value)}
                fullWidth inputProps={{ min: 0, step: '0.01' }} error={!!err('unitCost')} helperText={err('unitCost')} />
              <TextField label="Supplier" value={values.supplier} onChange={(e) => setField('supplier', e.target.value)}
                fullWidth error={!!err('supplier')} helperText={err('supplier')} />
              <TextField label="Reorder URL" value={values.reorderUrl} onChange={(e) => setField('reorderUrl', e.target.value)}
                fullWidth error={!!err('reorderUrl')} helperText={err('reorderUrl')} />
            </Stack>
          </AccordionDetails>
        </Accordion>
        <TextField label="Notes" value={values.notes} onChange={(e) => setField('notes', e.target.value)} fullWidth multiline rows={3}
          error={!!err('notes')} helperText={err('notes')} />
      </Stack>
    </EntityFormDialog>
  )
}

// ── Move Stock Dialog ─────────────────────────────────────────────

function MoveStockDialog({
  itemId, hubs, stock, onClose, onSuccess,
}: {
  itemId: string
  hubs: HubOption[]
  stock: HubStockRow[]
  onClose: () => void
  onSuccess: () => void
}) {
  // UXP-6 (6c / C7): on EntityFormDialog — pinned Cancel/Move, Enter submits, dirty
  // guard, errors on the field they belong to. The request and its rules are unchanged.
  const [fromHubId, setFromHubId] = React.useState('')
  const [toHubId, setToHubId] = React.useState('')
  const [qty, setQty] = React.useState(1)
  const [saving, setSaving] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const dirty = useDirtyState(true, { fromHubId, toHubId, qty })

  const hubsWithStock = stock.filter((s) => s.quantity > 0)
  const fromAvailable = stock.find((s) => s.hubId === fromHubId)?.available ?? 0

  const handleSubmit = async () => {
    setFormError(null)
    const errs: Record<string, string> = {}
    if (!fromHubId) errs.fromHubId = 'Select the source hub'
    if (!toHubId) errs.toHubId = 'Select the destination hub'
    if (fromHubId && toHubId && fromHubId === toHubId) errs.toHubId = 'Source and destination must differ'
    if (qty < 1) errs.qty = 'Quantity must be at least 1'
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return false }
    setFieldErrors({})
    setSaving(true)
    try {
      const res = await fetch(`/api/inventory/${itemId}/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromHubId, toHubId, qty }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 409) {
          setFormError(`Not enough stock at source hub (only ${fromAvailable} available)`)
        } else {
          const parsed = parseApiError(data, 'Move failed')
          setFieldErrors(parsed.fieldErrors)
          setFormError(parsed.formError)
        }
        return false
      }
      onSuccess()
    } catch { setFormError('Network error'); return false }
    finally { setSaving(false) }
  }

  return (
    <EntityFormDialog
      open
      title="Move stock"
      onClose={onClose}
      onSubmit={handleSubmit}
      saving={saving}
      dirty={dirty}
      formError={formError}
      legend={<RequiredLegend />}
      submitLabel="Move"
      savingLabel="Moving…"
      submitIcon={<SwapHorizIcon />}
      maxWidth="xs"
    >
      <Stack spacing={2.5} pt={0.5}>
        <TextField select label="From hub" value={fromHubId} onChange={(e) => { setFromHubId(e.target.value); setFieldErrors({}) }} fullWidth required
          error={!!fieldErrors.fromHubId} helperText={fieldErrors.fromHubId}>
          {hubsWithStock.length === 0
            ? <MenuItem value="" disabled>No hubs with stock</MenuItem>
            : hubsWithStock.map((s) => (
                <MenuItem key={s.hubId} value={s.hubId}>
                  {s.hubName ?? s.hubId} ({s.available} available)
                </MenuItem>
              ))}
        </TextField>
        <TextField select label="To hub" value={toHubId} onChange={(e) => { setToHubId(e.target.value); setFieldErrors({}) }} fullWidth required
          error={!!fieldErrors.toHubId} helperText={fieldErrors.toHubId}>
          {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name}</MenuItem>)}
        </TextField>
        <TextField
          label="Quantity"
          type="number"
          value={qty}
          onChange={(e) => { setQty(Math.max(1, parseInt(e.target.value) || 1)); setFieldErrors({}) }}
          inputProps={{ min: 1, max: fromAvailable || undefined }}
          fullWidth
          required
          error={!!fieldErrors.qty}
          helperText={fieldErrors.qty ?? (fromHubId ? `${fromAvailable} available at source` : undefined)}
        />
      </Stack>
    </EntityFormDialog>
  )
}

// ── Add Stock Dialog (seed first stock at a hub) ──────────────────
function AddStockDialog({
  itemId, hubs, stock, onClose, onSuccess,
}: {
  itemId: string
  hubs: HubOption[]
  stock: HubStockRow[]
  onClose: () => void
  onSuccess: () => void
}) {
  // Offer only hubs without a stock row yet — an existing hub is edited in-place in
  // the table. This is the first-stock path (FND-13): a brand-new item has no rows,
  // so Move Stock is disabled and the per-row editors don't exist; this seeds the
  // first row via the same { hubId, quantity } set-API the row editor uses.
  const stockedHubIds = new Set(stock.map((s) => s.hubId))
  const availableHubs = hubs.filter((h) => !stockedHubIds.has(h.id))
  // UXP-6 (6c / C7): on EntityFormDialog — pinned actions, Enter submits, dirty guard.
  const [hubId, setHubId] = React.useState('')
  const [qty, setQty] = React.useState(1)
  const [saving, setSaving] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const dirty = useDirtyState(true, { hubId, qty })

  const handleSubmit = async () => {
    setFormError(null)
    const errs: Record<string, string> = {}
    if (!hubId) errs.hubId = 'Select a hub'
    if (qty < 1) errs.qty = 'Quantity must be at least 1'
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return false }
    setFieldErrors({})
    setSaving(true)
    try {
      const res = await fetch(`/api/inventory/${itemId}/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Additive receive (race-safe) — see the stock route's receiveSchema.
        body: JSON.stringify({ hubId, addQty: qty }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const parsed = parseApiError(data, 'Could not add stock')
        // The route's field for the amount is `addQty`; show it on the Quantity field.
        const { addQty, ...rest } = parsed.fieldErrors
        setFieldErrors(addQty ? { ...rest, qty: addQty } : rest)
        setFormError(parsed.formError)
        return false
      }
      onSuccess()
    } catch { setFormError('Network error'); return false }
    finally { setSaving(false) }
  }

  return (
    <EntityFormDialog
      open
      title="Add stock at a hub"
      onClose={onClose}
      onSubmit={handleSubmit}
      saving={saving}
      dirty={dirty}
      formError={formError}
      legend={<RequiredLegend />}
      submitLabel="Add Stock"
      savingLabel="Adding…"
      submitDisabled={!hubId}
      maxWidth="xs"
    >
      <Stack spacing={2.5} pt={0.5}>
        <TextField select label="Hub" value={hubId} onChange={(e) => { setHubId(e.target.value); setFieldErrors({}) }} fullWidth required
          error={!!fieldErrors.hubId} helperText={fieldErrors.hubId}>
          {availableHubs.length === 0
            ? <MenuItem value="" disabled>Every hub already has a stock row — edit it in the table instead</MenuItem>
            : availableHubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name ?? h.id}</MenuItem>)}
        </TextField>
        <TextField label="Quantity" type="number" value={qty} onChange={(e) => { setQty(parseInt(e.target.value) || 0); setFieldErrors({}) }}
          inputProps={{ min: 1 }} fullWidth required error={!!fieldErrors.qty} helperText={fieldErrors.qty} />
      </Stack>
    </EntityFormDialog>
  )
}

// ── Stock by Hub Section ──────────────────────────────────────────

function StockByHubSection({
  itemId, hubs, onUpdated,
}: {
  itemId: string
  hubs: HubOption[]
  onUpdated: () => void
}) {
  const [stock, setStock] = React.useState<HubStockRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editingHubId, setEditingHubId] = React.useState<string | null>(null)
  const [editQty, setEditQty] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  const [moveOpen, setMoveOpen] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)

  const loadStock = React.useCallback(async () => {
    setLoading(true)
    fetch(`/api/inventory/${itemId}/stock`)
      .then((r) => r.json())
      .then((d) => setStock(d.data ?? []))
      .catch(() => setStock([]))
      .finally(() => setLoading(false))
  }, [itemId])

  React.useEffect(() => { loadStock() }, [loadStock])

  const handleEditSave = async (hubId: string) => {
    const qty = parseInt(editQty)
    if (isNaN(qty) || qty < 0) { setError('Quantity must be 0 or more'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/inventory/${itemId}/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hubId, quantity: qty }),
      })
      if (!res.ok) { setError('Save failed'); return }
      setEditingHubId(null)
      await loadStock()
      onUpdated()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  if (loading) return <Skeleton height={80} />

  return (
    <Box mb={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="subtitle2" fontWeight={600}>Stock by Hub</Typography>
        <Stack direction="row" spacing={1}>
          <MutationButton size="small" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}
            disabled={hubs.every((h) => stock.some((s) => s.hubId === h.id))}>
            Add Stock
          </MutationButton>
          <MutationButton size="small" startIcon={<SwapHorizIcon />} onClick={() => setMoveOpen(true)} disabled={stock.length === 0}>
            Move Stock
          </MutationButton>
        </Stack>
      </Stack>
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1 }}>{error}</Alert>}
      {stock.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No stock rows yet. Use the &ldquo;Add Stock&rdquo; button above to set stock at a hub.</Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 600, fontSize: 11, color: 'text.secondary' } }}>
                <TableCell>Hub</TableCell>
                <TableCell align="right">On-hand</TableCell>
                <TableCell align="right">Reserved</TableCell>
                <TableCell align="right">Available</TableCell>
                <TableCell align="right">Edit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {stock.map((row) => (
                <TableRow key={row.hubId} sx={{ '&:last-child td': { border: 0 } }}>
                  <TableCell>{row.hubName ?? row.hubId}</TableCell>
                  <TableCell align="right">
                    {editingHubId === row.hubId ? (
                      <TextField
                        size="small"
                        type="number"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        inputProps={{ min: 0, style: { width: 60, textAlign: 'right' } }}
                        variant="standard"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(row.hubId); if (e.key === 'Escape') setEditingHubId(null) }}
                      />
                    ) : (
                      <Typography variant="body2">{row.quantity}</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color="text.secondary">{row.reservedQty}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Chip size="small" label={row.available} color={row.available > 0 ? 'success' : 'default'} variant="outlined" />
                  </TableCell>
                  <TableCell align="right">
                    {editingHubId === row.hubId ? (
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <MutationButton size="small" onClick={() => handleEditSave(row.hubId)} disabled={saving}>
                          {saving ? <CircularProgress size={14} /> : 'Save'}
                        </MutationButton>
                        <Button size="small" onClick={() => setEditingHubId(null)}>Cancel</Button>
                      </Stack>
                    ) : (
                      <MutationIconButton
                        size="small"
                        tooltip="Edit on-hand quantity"
                        onClick={() => { setEditingHubId(row.hubId); setEditQty(String(row.quantity)) }}
                      >
                        <EditIcon fontSize="small" />
                      </MutationIconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {moveOpen && (
        <MoveStockDialog
          itemId={itemId}
          hubs={hubs}
          stock={stock}
          onClose={() => setMoveOpen(false)}
          onSuccess={() => { setMoveOpen(false); loadStock(); onUpdated() }}
        />
      )}
      {addOpen && (
        <AddStockDialog
          itemId={itemId}
          hubs={hubs}
          stock={stock}
          onClose={() => setAddOpen(false)}
          onSuccess={() => { setAddOpen(false); loadStock(); onUpdated() }}
        />
      )}
    </Box>
  )
}

// ── Detail Drawer ─────────────────────────────────────────────────

async function downloadUnitQR(unit: { qrCodeId: string; serialNumber: string | null }, itemName: string) {
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, unit.qrCodeId, { width: 300 })
  const link = document.createElement('a')
  link.download = `qr-${itemName.replace(/\s+/g, '-')}-${unit.qrCodeId.slice(0, 8)}.png`
  link.href = canvas.toDataURL()
  link.click()
}

// UXP-6 (6c): what opens the drawer. A list row (with its current-status extras), or
// just an id from the success toast's Open action — plus, after a create whose units
// call failed (T4), the tab to land on and the notice to show there.
type DrawerRow = Pick<InventoryItemRow, 'id'> &
  Partial<Pick<InventoryItemRow, 'currentOperator' | 'currentProject' | 'activeProjects'>> & {
    openOn?: 'units'
    unitsError?: string | null
  }

function ItemDetailDrawer({
  row, hubs, onClose, onEdit, onRetire, onUpdated,
}: {
  row: DrawerRow | null
  hubs: HubOption[]
  onClose: () => void
  onEdit: (item: InventoryItemRow) => void
  onRetire: (item: InventoryItemRow) => void
  onUpdated: () => void
}) {
  const canEdit = useCanEdit()
  const showToast = useToast()
  const [detail, setDetail] = React.useState<ItemDetail | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState(0)
  // Per-open intent (tab + Units notice), applied on the row transition with React's
  // "information from previous renders" pattern rather than an effect.
  const [seenRow, setSeenRow] = React.useState<DrawerRow | null>(null)
  const [unitsNotice, setUnitsNotice] = React.useState<string | null>(null)
  if (seenRow !== row) {
    setSeenRow(row)
    setUnitsNotice(row?.unitsError ?? null)
    setActiveTab(row?.openOn === 'units' ? 1 : 0)
  }
  const [serialEdits, setSerialEdits] = React.useState<Record<string, string>>({})
  const [addingUnit, setAddingUnit] = React.useState(false)
  const [newUnitQr, setNewUnitQr] = React.useState('')
  const [newUnitSerial, setNewUnitSerial] = React.useState('')
  const [addUnitError, setAddUnitError] = React.useState('')
  const [repairUnitId, setRepairUnitId] = React.useState<string | null>(null)
  const [retireUnitId, setRetireUnitId] = React.useState<string | null>(null)
  const [expandedUnitId, setExpandedUnitId] = React.useState<string | null>(null)

  const loadDetail = React.useCallback(async (id: string) => {
    setLoading(true)
    fetch(`/api/inventory/${id}`)
      .then((r) => r.json())
      .then((d) => { setDetail(d.data) })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    setExpandedUnitId(null)
    if (!row) { setDetail(null); return }
    loadDetail(row.id)
  }, [row, loadDetail])

  const handleUnitStatusChange = async (unitId: string, status: string) => {
    const res = await fetch(`/api/inventory/units/${unitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      // Q4: surface the failure — the reload below otherwise silently reverted the change.
      const d = await res.json().catch(() => ({}))
      showToast({ message: typeof d.error === 'string' ? d.error : 'Could not update unit status.', severity: 'error' })
    }
    if (row) loadDetail(row.id)
  }

  const handleSerialBlur = async (unitId: string) => {
    const sn = serialEdits[unitId]
    if (sn === undefined) return
    const res = await fetch(`/api/inventory/units/${unitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serialNumber: sn || null }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      showToast({ message: typeof d.error === 'string' ? d.error : 'Could not save the serial number.', severity: 'error' })
    }
    setSerialEdits((prev) => { const n = { ...prev }; delete n[unitId]; return n })
    if (row) loadDetail(row.id)
  }

  const handleAddUnit = async () => {
    if (!detail) return
    setAddingUnit(true)
    setAddUnitError('')
    const qr = newUnitQr.trim()
    const serial = newUnitSerial.trim()
    const res = await fetch(`/api/inventory/${detail.id}/units`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        count: 1,
        ...(qr ? { qrCodeIds: [qr] } : {}),
        ...(serial ? { serialNumbers: [serial] } : {}),
      }),
    })
    setAddingUnit(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setAddUnitError(typeof d.error === 'string' ? d.error : 'Could not add unit.')
      return
    }
    setNewUnitQr('')
    setNewUnitSerial('')
    setUnitsNotice(null)
    loadDetail(detail.id)
    onUpdated()
  }

  const handleApproveRetirement = async () => {
    if (!detail || !retireUnitId) return
    const res = await fetch(`/api/inventory/${detail.id}/review-inoperable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unitId: retireUnitId, decision: 'RETIRE', note: 'Approved for retirement by admin' }),
    })
    if (res.ok) {
      showToast({ message: 'Unit retired.', severity: 'success' })
    } else {
      // Q4: surface the failure instead of silently closing + reverting on reload.
      const d = await res.json().catch(() => ({}))
      showToast({ message: typeof d.error === 'string' ? d.error : 'Could not retire the unit.', severity: 'error' })
    }
    setRetireUnitId(null)
    loadDetail(detail.id)
    onUpdated()
  }

  const damagePhotos = detail?.photos.filter((p) => p.context === 'DAMAGE') ?? []

  return (
    <DetailDrawer open={!!row} onClose={onClose} width={540}>
      {loading && (
        <Box p={3}><Stack spacing={1.5}>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={32} />)}</Stack></Box>
      )}

      {!loading && detail && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <Box px={3} pt={3} pb={1}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Typography variant="h6" fontWeight={700}>{detail.name}</Typography>
                <Chip size="small" label={detail.itemType === 'SERIALIZED' ? 'Serialized' : 'Consumable'}
                  variant="outlined" color={detail.itemType === 'SERIALIZED' ? 'primary' : 'default'} sx={{ mt: 0.5 }} />
              </Box>
            </Stack>
            {/* Unit count breakdown */}
            <Stack direction="row" spacing={0.5} flexWrap="wrap" mt={1}>
              {detail.unitCounts.available > 0 && (
                <Chip size="small" color="success" label={`${detail.unitCounts.available} Available`} />
              )}
              {detail.unitCounts.checkedOut > 0 && (
                <Chip size="small" color="info" label={`${detail.unitCounts.checkedOut} Checked Out`} />
              )}
              {detail.unitCounts.inMaintenance > 0 && (
                <Chip size="small" color="warning" label={`${detail.unitCounts.inMaintenance} In Maintenance`} />
              )}
              {detail.unitCounts.inoperable > 0 && (
                <Chip size="small" color="error" label={`${detail.unitCounts.inoperable} Inoperable`} />
              )}
              {detail.unitCounts.retired > 0 && (
                <Chip size="small" color="default" label={`${detail.unitCounts.retired} Retired`} />
              )}
              {detail.unitCounts.totalUnits === 0 && (
                <Chip size="small" color="default" label="No units" />
              )}
            </Stack>
          </Box>

          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Tab label="Info" />
            <Tab label={`Units (${detail.unitCounts.totalUnits})`} />
            <Tab label="History" />
          </Tabs>

          <Box sx={{ flex: 1, overflow: 'auto', px: 3, py: 2 }}>

            {/* ── Info Tab ── */}
            {activeTab === 0 && (
              <>
                {detail.unitCounts.inoperable > 0 && (
                  <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" fontWeight={700}>
                      {detail.unitCounts.inoperable} unit{detail.unitCounts.inoperable !== 1 ? 's' : ''} inoperable — see Units tab to review
                    </Typography>
                  </Alert>
                )}
                {damagePhotos.length > 0 && (
                  <Box mb={2}>
                    <PhotoGallery photos={damagePhotos.map((p) => ({ id: p.id, url: p.url, context: p.context }))} />
                  </Box>
                )}

                <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5} mb={3}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Category</Typography>
                    <Typography variant="body2">{detail.category?.name ?? '—'}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Hub Location</Typography>
                    <Typography variant="body2">{detail.hub ? `${detail.hub.city}, ${detail.hub.state}` : '—'}</Typography>
                  </Box>
                  {detail.itemType === 'SERIALIZED' && detail.unitId && (
                    <Box>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>Legacy Unit ID</Typography>
                      <Typography variant="body2">{detail.unitId}</Typography>
                    </Box>
                  )}
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Total Units</Typography>
                    <Typography variant="body2">
                      {detail.expectedQuantity != null ? `${detail.unitCounts.totalUnits} / ${detail.expectedQuantity}` : String(detail.unitCounts.totalUnits)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Low Stock Threshold</Typography>
                    <Typography variant="body2">{detail.lowStockThreshold != null ? String(detail.lowStockThreshold) : '—'}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Unit Cost</Typography>
                    <Typography variant="body2">{detail.unitCost != null ? `$${detail.unitCost}` : '—'}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Supplier</Typography>
                    <Typography variant="body2">{detail.supplier ?? '—'}</Typography>
                  </Box>
                  {detail.reorderUrl && (
                    <Box gridColumn="1 / -1">
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>Reorder URL</Typography>
                      <Typography variant="body2">
                        <Link href={detail.reorderUrl} target="_blank" rel="noopener noreferrer">{detail.reorderUrl}</Link>
                      </Typography>
                    </Box>
                  )}
                  {detail.notes && (
                    <Box gridColumn="1 / -1">
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>Notes</Typography>
                      <Typography variant="body2">{detail.notes}</Typography>
                    </Box>
                  )}
                </Box>

                {detail.itemType === 'CONSUMABLE' && (
                  <StockByHubSection itemId={detail.id} hubs={hubs} onUpdated={() => { loadDetail(detail.id); onUpdated() }} />
                )}

                {detail.unitCounts.checkedOut > 0 && (
                  <Box mb={2}>
                    <Typography variant="subtitle2" fontWeight={600} mb={0.5}>Current Status</Typography>
                    {row?.currentOperator && <Typography variant="body2">Currently with <strong>{row.currentOperator.name}</strong></Typography>}
                    {(row?.activeProjects ?? []).length > 0
                      ? <Stack direction="row" spacing={0.5} flexWrap="wrap" mt={0.5}>
                          <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>Projects:</Typography>
                          {(row?.activeProjects ?? []).map((p) => <Chip key={p.id} size="small" label={p.name} variant="outlined" />)}
                        </Stack>
                      : row?.currentProject && <Typography variant="body2">Checked out to <strong>{row.currentProject.name}</strong></Typography>}
                  </Box>
                )}
              </>
            )}

            {/* ── Units Tab ── */}
            {activeTab === 1 && (
              <>
                {/* T4 hand-off: the item was created but its units were not. */}
                {unitsNotice && (
                  <Alert severity="error" onClose={() => setUnitsNotice(null)} sx={{ mb: 2 }}>{unitsNotice}</Alert>
                )}
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { fontWeight: 600, fontSize: 11, color: 'text.secondary' } }}>
                        <TableCell>#</TableCell>
                        <TableCell>Serial Number</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align="right">Actions</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detail.units.map((unit, idx) => (
                        <React.Fragment key={unit.id}>
                          <TableRow sx={{ '&:last-child td': { border: 0 } }}>
                            <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>{idx + 1}</TableCell>
                            <TableCell>
                              <TextField
                                size="small"
                                variant="standard"
                                placeholder="—"
                                value={serialEdits[unit.id] ?? (unit.serialNumber ?? '')}
                                onChange={(e) => setSerialEdits((p) => ({ ...p, [unit.id]: e.target.value }))}
                                onBlur={() => handleSerialBlur(unit.id)}
                                sx={{ width: 120 }}
                                inputProps={{ style: { fontSize: 13 } }}
                                disabled={!canEdit}
                              />
                            </TableCell>
                            <TableCell>
                              <TextField
                                select
                                size="small"
                                variant="standard"
                                value={unit.status}
                                onChange={(e) => handleUnitStatusChange(unit.id, e.target.value)}
                                sx={{ minWidth: 130 }}
                                SelectProps={{ style: { fontSize: 13 } }}
                                disabled={!canEdit}
                              >
                                {Object.entries(EQUIPMENT_STATUS).map(([v, m]) => (
                                  <MenuItem key={v} value={v}>{m.label}</MenuItem>
                                ))}
                              </TextField>
                            </TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                <Tooltip title="Download QR">
                                  <IconButton size="small" onClick={() => downloadUnitQR(unit, detail.name)}>
                                    <DownloadIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                {unit.status === 'INOPERABLE' && (
                                  <>
                                    <MutationIconButton size="small" tooltip="Retire this unit" color="error" onClick={() => setRetireUnitId(unit.id)}>
                                      <ArchiveIcon fontSize="small" />
                                    </MutationIconButton>
                                    <MutationIconButton size="small" tooltip="Send for repair" onClick={() => setRepairUnitId(unit.id)}>
                                      <EditIcon fontSize="small" />
                                    </MutationIconButton>
                                  </>
                                )}
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <IconButton
                                size="small"
                                onClick={() => setExpandedUnitId((prev) => prev === unit.id ? null : unit.id)}
                                title={expandedUnitId === unit.id ? 'Hide history' : 'View history'}
                              >
                                {expandedUnitId === unit.id ? <ExpandLessIcon fontSize="small" /> : <HistoryIcon fontSize="small" />}
                              </IconButton>
                            </TableCell>
                          </TableRow>
                          {expandedUnitId === unit.id && (() => {
                            const unitLogs = detail.checkLogs.filter((l) => l.inventoryUnitId === unit.id)
                            return (
                              <TableRow>
                                <TableCell colSpan={5} sx={{ pt: 0, pb: 1.5, px: 3, bgcolor: 'action.hover' }}>
                                  <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={0.5}>
                                    {unit.serialNumber ?? `Unit ${idx + 1}`} — history ({unitLogs.length} event{unitLogs.length !== 1 ? 's' : ''})
                                  </Typography>
                                  {unitLogs.length === 0 ? (
                                    <Typography variant="caption" color="text.secondary">No check logs for this unit.</Typography>
                                  ) : (
                                    <Stack spacing={0.5}>
                                      {unitLogs.map((log) => (
                                        <Stack key={log.id} direction="row" spacing={1} alignItems="center">
                                          <Chip
                                            size="small"
                                            label={log.action === 'CHECK_OUT' ? 'Out' : 'In'}
                                            color={log.action === 'CHECK_OUT' ? 'info' : 'success'}
                                            sx={{ minWidth: 40 }}
                                          />
                                          <Typography variant="caption">{log.operator?.name ?? 'Unknown'}</Typography>
                                          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto !important' }}>
                                            {formatDate(log.submittedAt)}
                                          </Typography>
                                        </Stack>
                                      ))}
                                    </Stack>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })()}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <EditGuard>
                  <Stack spacing={1.5} sx={{ mt: 1, maxWidth: 420 }}>
                    <Typography variant="caption" color="text.secondary">
                      Add a unit and (optionally) register its existing QR label by scanning
                      or typing the code.
                    </Typography>
                    <QrScanField
                      value={newUnitQr}
                      onChange={(c) => { setNewUnitQr(c); setAddUnitError('') }}
                      label="QR label code (optional)"
                      helperText="Leave blank to auto-generate an internal id"
                    />
                    <TextField
                      size="small"
                      label="Serial number (optional)"
                      value={newUnitSerial}
                      onChange={(e) => setNewUnitSerial(e.target.value)}
                      fullWidth
                    />
                    {addUnitError && (
                      <Alert severity="error" onClose={() => setAddUnitError('')}>{addUnitError}</Alert>
                    )}
                    <Button
                      size="small"
                      startIcon={addingUnit ? <CircularProgress size={14} /> : <AddIcon />}
                      onClick={handleAddUnit}
                      disabled={addingUnit}
                      variant="outlined"
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      {addingUnit ? 'Adding…' : '+ Add Unit'}
                    </Button>
                  </Stack>
                </EditGuard>
              </>
            )}

            {/* ── History Tab ── */}
            {activeTab === 2 && (
              <>
                {detail.checkLogs.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No check logs yet.</Typography>
                ) : (
                  <Stack spacing={1}>
                    {detail.checkLogs.map((log) => (
                      <Stack key={log.id} direction="row" spacing={1} alignItems="center">
                        <Chip size="small" label={log.action === 'CHECK_OUT' ? 'Out' : 'In'}
                          color={log.action === 'CHECK_OUT' ? 'info' : 'success'} sx={{ minWidth: 40 }} />
                        <Typography variant="body2">{log.operator?.name ?? 'Unknown'}</Typography>
                        {log.condition && <Chip size="small" label={log.condition.replace(/_/g, ' ')} variant="outlined" />}
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto !important' }}>
                          {formatDate(log.submittedAt)}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </>
            )}
          </Box>

          <Divider />
          <Stack direction="row" spacing={1} px={3} py={2} justifyContent="flex-end">
            <Button onClick={onClose}>Close</Button>
            {detail.unitCounts.available > 0 && (
              <MutationButton variant="outlined" color="error" startIcon={<ArchiveIcon />}
                onClick={() => { onClose(); onRetire(detail) }}>
                Retire
              </MutationButton>
            )}
            <MutationButton variant="contained" startIcon={<EditIcon />}
              onClick={() => { onClose(); onEdit(detail) }}>
              Edit
            </MutationButton>
          </Stack>
        </Box>
      )}

      {/* Per-unit retire confirmation */}
      <ConfirmDialog
        open={!!retireUnitId}
        title="Retire this unit?"
        message="This will permanently retire this unit. History is preserved."
        confirmLabel="Retire Unit"
        confirmColor="error"
        onClose={() => setRetireUnitId(null)}
        onConfirm={handleApproveRetirement}
      />

      {/* Per-unit repair dialog */}
      {detail && repairUnitId && (
        <RepairReviewDialog
          open={!!repairUnitId}
          itemId={detail.id}
          unitId={repairUnitId}
          hubs={hubs}
          onClose={() => setRepairUnitId(null)}
          onSuccess={() => { setRepairUnitId(null); loadDetail(detail.id); onUpdated() }}
        />
      )}
    </DetailDrawer>
  )
}

// ── Main Page ─────────────────────────────────────────────────────

// FND-48: useUrlFilters -> useSearchParams requires a Suspense boundary at the
// route (matches src/app/setup-account/page.tsx); without it `next build` fails.
export default function AdminInventoryPage() {
  return (
    <React.Suspense>
      <AdminInventoryContent />
    </React.Suspense>
  )
}

function AdminInventoryContent() {
  const canEdit = useCanEdit()
  const showToast = useToast()
  const [items, setItems] = React.useState<InventoryItemRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(0)
  const [pageSize] = React.useState(25)
  const [search, setSearch] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])
  // FND-48: these five filters live in the URL (deep-linkable, reload-safe).
  const { filters, setFilters } = useUrlFilters(INVENTORY_FILTER_DEFAULTS)
  const categoryFilter = filters.categoryId
  const itemTypeFilter = filters.itemType
  const hubFilter = filters.hubId
  const operatorFilter = filters.operatorId
  const projectFilter = filters.projectId
  const [loading, setLoading] = React.useState(true)
  const [categories, setCategories] = React.useState<CategoryOption[]>([])
  const [hubs, setHubs] = React.useState<HubOption[]>([])
  const [operators, setOperators] = React.useState<UserOption[]>([])
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([])
  const [formItem, setFormItem] = React.useState<InventoryItemRow | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [detailRow, setDetailRow] = React.useState<DrawerRow | null>(null)
  const [retireItem, setRetireItem] = React.useState<InventoryItemRow | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize) })
    if (debouncedSearch) params.set('q', debouncedSearch)
    if (categoryFilter) params.set('categoryId', categoryFilter)
    if (itemTypeFilter) params.set('itemType', itemTypeFilter)
    if (hubFilter) params.set('hubId', hubFilter)
    if (operatorFilter) params.set('operatorId', operatorFilter)
    if (projectFilter) params.set('projectId', projectFilter)
    const res = await fetch(`/api/inventory?${params}`).then((r) => r.json()).catch(() => ({ data: [], total: 0 }))
    setItems(res.data ?? [])
    setTotal(res.total ?? 0)
    setLoading(false)
  }, [page, pageSize, debouncedSearch, categoryFilter, itemTypeFilter, hubFilter, operatorFilter, projectFilter])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    fetch('/api/inventory/categories').then((r) => r.json()).then((d) => setCategories(d.data ?? [])).catch(() => {})
    fetch('/api/inventory/hubs').then((r) => r.json()).then((d) => setHubs(d.data ?? [])).catch(() => {})
    fetch('/api/users').then((r) => r.json()).then((d) => {
      const all = d.data ?? []
      setOperators(all.filter((u: UserOption) => u.role === 'OPERATOR' || u.role === 'ADMIN'))
    }).catch(() => {})
    fetch('/api/projects').then((r) => r.json()).then((d) => setProjects(d.data ?? d ?? [])).catch(() => {})
  }, [])

  const handleRetire = async () => {
    if (!retireItem) return
    const res = await fetch(`/api/inventory/${retireItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RETIRED' }),
    })
    setRetireItem(null)
    if (res.ok) { showToast({ message: `${retireItem.name} retired`, severity: 'success' }); load() }
    else showToast({ message: 'Failed to retire item', severity: 'error' })
  }

  // UXP-6 (6c): "<name> added · Open" (the drawer), or — when a serialized item's
  // units could not be created (T4) — straight to its Units tab with the error.
  const handleItemSaved = (saved: ItemSaved, { isEdit, unitsError }: ItemSavedInfo) => {
    load()
    if (unitsError) {
      setDetailRow({ id: saved.id, openOn: 'units', unitsError })
      return
    }
    showToast({
      message: `${saved.name} ${isEdit ? 'updated' : 'added'}`,
      severity: 'success',
      action: { label: 'Open', onClick: () => setDetailRow({ id: saved.id }) },
    })
  }

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h5" fontWeight={700}>Inventory</Typography>
          {!canEdit && <Chip size="small" label="View only" variant="outlined" />}
        </Stack>
        <MutationButton variant="contained" startIcon={<AddIcon />} onClick={() => { setFormItem(null); setFormOpen(true) }}>
          Add Item
        </MutationButton>
      </Stack>

      {/* Filters */}
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          placeholder="Search items…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          sx={{ width: 260 }}
        />
        <Stack direction="row" spacing={0.75}>
          {(['', 'CONSUMABLE', 'SERIALIZED'] as const).map((type) => (
            <Chip
              key={type || 'all'}
              label={type === '' ? 'All' : type === 'CONSUMABLE' ? 'Consumables' : 'Serialized'}
              onClick={() => { setFilters({ itemType: type }); setPage(0) }}
              color={itemTypeFilter === type ? 'primary' : 'default'}
              variant={itemTypeFilter === type ? 'filled' : 'outlined'}
              size="small"
              sx={{ cursor: 'pointer' }}
            />
          ))}
        </Stack>
        {categories.length > 0 && (
          <TextField
            select
            size="small"
            label="Category"
            value={categoryFilter}
            onChange={(e) => { setFilters({ categoryId: e.target.value }); setPage(0) }}
            sx={{ width: 200 }}
          >
            <MenuItem value="">All categories</MenuItem>
            {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField>
        )}
        {hubs.length > 0 && (
          <TextField
            select
            size="small"
            label="Hub"
            value={hubFilter}
            onChange={(e) => { setFilters({ hubId: e.target.value }); setPage(0) }}
            sx={{ width: 180 }}
          >
            <MenuItem value="">All hubs</MenuItem>
            {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name}</MenuItem>)}
          </TextField>
        )}
        {operators.length > 0 && (
          <TextField
            select
            size="small"
            label="Operator"
            value={operatorFilter}
            onChange={(e) => { setFilters({ operatorId: e.target.value }); setPage(0) }}
            sx={{ width: 180 }}
          >
            <MenuItem value="">All operators</MenuItem>
            {operators.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
          </TextField>
        )}
        {projects.length > 0 && (
          <TextField
            select
            size="small"
            label="Project"
            value={projectFilter}
            onChange={(e) => { setFilters({ projectId: e.target.value }); setPage(0) }}
            sx={{ width: 180 }}
          >
            <MenuItem value="">All projects</MenuItem>
            {projects.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
        )}
        {(categoryFilter || itemTypeFilter || hubFilter || operatorFilter || projectFilter || search) && (
          <Button size="small" variant="text" onClick={() => {
            setSearch('')
            setFilters({ categoryId: '', itemType: '', hubId: '', operatorId: '', projectId: '' })
            setPage(0)
          }}>Clear filters</Button>
        )}
      </Stack>

      {/* Table */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 600, fontSize: 12, color: 'text.secondary' } }}>
              <TableCell>Name</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Hub</TableCell>
              <TableCell align="center">Available</TableCell>
              <TableCell align="center">Out</TableCell>
              <TableCell align="center">Total</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}><Skeleton height={24} /></TableCell>
                    ))}
                  </TableRow>
                ))
              : groupBy(
                  items,
                  (item) => (typeof item.category === 'object' ? item.category?.name : (item.category as unknown as string)) ?? 'Uncategorized',
                ).flatMap(({ group, items: gi }) => [
                  <TableRow key={`__hdr__${group}`}>
                    <TableCell colSpan={7} sx={{ bgcolor: 'grey.50', py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.6 }}>{group}</Typography>
                    </TableCell>
                  </TableRow>,
                  ...gi.map((item) => (
                    <TableRow
                      key={item.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => setDetailRow(item)}
                    >
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2" fontWeight={500}>{item.name}</Typography>
                          {item.itemType === 'SERIALIZED' && (
                            <StatusChip label="S" variant="outlined" color="primary" />
                          )}
                          {item.unitCounts?.inoperable > 0 && (
                            <Tooltip title={`${item.unitCounts.inoperable} inoperable`}>
                              <WarningAmberIcon fontSize="small" color="warning" />
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {typeof item.category === 'object' ? item.category?.name : (item.category ?? '—')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {item.hub ? `${item.hub.city}, ${item.hub.state}` : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip size="small" label={item.itemType === 'CONSUMABLE' ? (item.availableQuantity ?? 0) : (item.unitCounts?.available ?? 0)} color="success" variant="outlined" />
                      </TableCell>
                      <TableCell align="center">
                        <Chip size="small" label={item.unitCounts?.checkedOut ?? 0} color={item.unitCounts?.checkedOut > 0 ? 'info' : 'default'} variant="outlined" />
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2">{item.itemType === 'CONSUMABLE' ? (item.derivedQuantity ?? item.quantity ?? 0) : (item.unitCounts?.totalUnits ?? 0)}</Typography>
                      </TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <MutationIconButton size="small" tooltip="Edit" onClick={() => { setFormItem(item); setFormOpen(true) }}>
                            <EditIcon fontSize="small" />
                          </MutationIconButton>
                          <MutationIconButton size="small" tooltip="Retire" color="error" onClick={() => setRetireItem(item)}>
                            <ArchiveIcon fontSize="small" />
                          </MutationIconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )),
                ])}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No items found{search ? ` for "${search}"` : ''}.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={total}
        page={page}
        rowsPerPage={pageSize}
        rowsPerPageOptions={[25]}
        onPageChange={(_, p) => setPage(p)}
      />

      {/* Add / Edit dialog */}
      {formOpen && (
        <ItemFormDialog
          key={formItem?.id ?? 'new'}
          item={formItem}
          categories={categories}
          hubs={hubs}
          onClose={() => setFormOpen(false)}
          onSaved={handleItemSaved}
        />
      )}

      {/* Detail drawer */}
      <ItemDetailDrawer
        row={detailRow}
        hubs={hubs}
        onClose={() => setDetailRow(null)}
        onEdit={(item) => { setFormItem(item); setFormOpen(true) }}
        onRetire={(item) => setRetireItem(item)}
        onUpdated={load}
      />

      {/* Retire confirm */}
      <ConfirmDialog
        open={!!retireItem}
        title="Retire item?"
        message={`Retire "${retireItem?.name}"? All available units will be marked retired. History is preserved.`}
        confirmLabel="Retire"
        confirmColor="error"
        onClose={() => setRetireItem(null)}
        onConfirm={handleRetire}
      />
    </Box>
  )
}
