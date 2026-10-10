'use client'

import * as React from 'react'
import { useUrlFilters } from '@/hooks/useUrlFilters'
import {
  Box, Typography, Button, TextField, MenuItem, Stack, Alert,
  Chip, IconButton, Tooltip, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Skeleton, Switch, FormControlLabel, Accordion, AccordionSummary,
  AccordionDetails, Divider,
  FormControl, FormLabel, FormHelperText, RadioGroup, Radio, Link, Tabs, Tab,
  Checkbox, Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemText,
} from '@mui/material'
import { StatusChip } from '@/components/shared/StatusChip'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { PagedTable } from '@/components/ui/PagedTable'
import { useListQuery } from '@/hooks/useListQuery'
import { useInvalidation } from '@/hooks/useInvalidation'
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
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash'
import QRCode from 'qrcode'
import { useToast } from '@/components/shared/useToast'
import { QrScanField } from '@/components/shared/QrScanField'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useMultiSelect } from '@/components/shared/useMultiSelect'
import { BulkActionBar } from '@/components/shared/BulkActionBar'
import { copy, deletedLabel } from '@/lib/copy/admin-actions'
import { PhotoGallery } from '@/components/shared/PhotoGallery'
import { RepairReviewDialog } from '@/components/shared/RepairReviewDialog'
import { EQUIPMENT_STATUS } from '@/lib/status'
import type { ItemCounts } from '@/lib/inventory'
import { useCanEdit, EditGuard, MutationButton, MutationIconButton } from '@/components/shared/ReadOnly'
import { groupBy, formatDate } from '@/lib/utils'

// FND-48: URL-persisted filter keys for the inventory list (stable object so the
// useUrlFilters setter callback stays referentially stable).
//
// PR-1a: `page` joins them so a filter change can clear the page key in the SAME
// single history-replace that sets the filter (useUrlFilters patches many keys at
// once). Two concurrent replaces would race and one would win with a stale query.
const INVENTORY_FILTER_DEFAULTS = { categoryId: '', itemType: '', hubId: '', operatorId: '', projectId: '', page: '' }

/** PR-3b (D-g): the unit states an admin sets by hand. */
const ADMIN_UNIT_STATUSES = ['AVAILABLE', 'RETIRED']

/** Where each derived unit state comes from — shown under its chip in the Units tab. */
const UNIT_STATUS_SOURCE: Record<string, string> = {
  CHECKED_OUT: 'via a deployment',
  IN_TRANSIT: 'via a return to hub',
  IN_MAINTENANCE: 'via Report a problem or Send for repair',
  INOPERABLE: 'via Report a problem',
}

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
  inTransit: number
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
  // D-a (list half): carried so a row surfaced by "Show retired" says so.
  status?: string
  unitId: string | null
  expectedQuantity: number | null
  createdAt: string
  updatedAt: string
  currentOperator: { id: string; name: string } | null
  currentProject: { id: string; name: string; location: string | null } | null
  activeProjects?: { id: string; name: string }[]
  unitCounts: UnitCounts
  /** PR-2 (RC-3): the server's one set of numbers. Render these; never recount. */
  itemCounts: ItemCounts
  units: UnitRow[]
  derivedQuantity: number
  availableQuantity: number
  /** PR-3c: set only in the "Show deleted" view (and a deleted item's drawer). */
  deletedAt?: string | null
  deletedBy?: { id: string; name: string } | null
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
  // PR-6 (D-y): the type is fixed once the item has units or stock. The disabled field
  // still submits its value (the server's type-lock guard is the truth).
  const typeLocked = isEdit && !!item && (item.unitCounts.totalUnits > 0 || item.itemCounts.owned > 0)
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
            <FormControlLabel value="CONSUMABLE" control={<Radio />} label="Consumable" disabled={typeLocked} />
            <FormControlLabel value="SERIALIZED" control={<Radio />} label="Serialized Item" disabled={typeLocked} />
          </RadioGroup>
          {(err('itemType') || typeLocked) && (
            <FormHelperText>{err('itemType') ?? 'Type is fixed once an item has units or stock.'}</FormHelperText>
          )}
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
              {/* PR-2: `owned` — retired units excluded, consumable stock on rigs included. */}
              {isSerialized
                ? `${item.itemCounts.owned} (managed in Units tab)`
                : `${item.itemCounts.owned} total (managed per hub — use Stock by Hub below)`}
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
          helperText={err('lowStockThreshold') ?? (isSerialized
            ? 'Alert when units available to pick, across all hubs, fall to or below this number.'
            : 'Alert when on-hand stock at any one hub falls to or below this number.')} />
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

// ── PR-3c · Delete (and restore) ─────────────────────────────────
// D-s, printed in the dialog: Retire is for real gear you are done with — it stays
// in history and reports. Delete is for mistakes, duplicates and test entries — it
// leaves every list, count and report, and can be restored.


/** `GET /api/inventory/<id>/references` — what the Delete dialog says before confirming. */
interface DeleteFacts {
  itemType: string
  units: Record<string, number>
  stock: { onHand: number; hubs: number }
  history: { deployments: number; checkLogs: number; repairs: number; photos: number }
}

const countOf = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// The Delete dialog's details are at most three body2 lines (units/stock · history ·
// restorable) with 4px gaps — reserved before they load (1.43 × 14px ≈ 20px a line).
const DELETE_DETAILS_MIN_HEIGHT = 3 * 20 + 2 * 4

/** The dialog's detail lines: what goes with the item, what history is kept, and the way back. */
function deleteDetailLines(f: DeleteFacts): string[] {
  const lines: string[] = []
  if (f.itemType === 'SERIALIZED') {
    const total = Object.values(f.units).reduce((a, b) => a + b, 0)
    if (total > 0) {
      const parts = Object.entries(f.units)
        .filter(([, n]) => n > 0)
        .map(([status, n]) => `${n} ${(EQUIPMENT_STATUS[status]?.label ?? status).toLowerCase()}`)
      lines.push(copy('item.delete').unitsGo(total, parts.join(', ')))
    }
  } else if (f.stock.onHand > 0) {
    lines.push(copy('item.delete').stockGoes(f.stock.onHand, f.stock.hubs))
  }
  const h = f.history
  const kept = [
    h.deployments > 0 && countOf(h.deployments, 'deployment'),
    h.checkLogs > 0 && countOf(h.checkLogs, 'check-log entry', 'check-log entries'),
    h.repairs > 0 && countOf(h.repairs, 'repair'),
    h.photos > 0 && countOf(h.photos, 'photo'),
  ].filter(Boolean)
  if (kept.length > 0) lines.push(copy('item.delete').historyKept(kept as string[]))
  lines.push(copy('item.delete').restorable)
  return lines
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
type DrawerTab = 'info' | 'units' | 'history'

type DrawerRow = Pick<InventoryItemRow, 'id'> &
  Partial<Pick<InventoryItemRow, 'currentOperator' | 'currentProject' | 'activeProjects'>> & {
    openOn?: 'units'
    unitsError?: string | null
  }

function ItemDetailDrawer({
  row, hubs, onClose, onEdit, onRetire, onDelete, onRestore, onUpdated,
}: {
  row: DrawerRow | null
  hubs: HubOption[]
  onClose: () => void
  onEdit: (item: InventoryItemRow) => void
  onRetire: (item: InventoryItemRow) => void
  onDelete: (item: InventoryItemRow) => void
  onRestore: (item: InventoryItemRow) => void
  onUpdated: () => void
}) {
  const canEdit = useCanEdit()
  const showToast = useToast()
  const [detail, setDetail] = React.useState<ItemDetail | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<DrawerTab>('info')
  // Per-open intent (tab + Units notice), applied on the row transition with React's
  // "information from previous renders" pattern rather than an effect.
  const [seenRow, setSeenRow] = React.useState<DrawerRow | null>(null)
  const [unitsNotice, setUnitsNotice] = React.useState<string | null>(null)
  if (seenRow !== row) {
    setSeenRow(row)
    setUnitsNotice(row?.unitsError ?? null)
    setActiveTab(row?.openOn === 'units' ? 'units' : 'info')
  }
  const [serialEdits, setSerialEdits] = React.useState<Record<string, string>>({})
  const [addingUnit, setAddingUnit] = React.useState(false)
  const [newUnitQr, setNewUnitQr] = React.useState('')
  const [newUnitSerial, setNewUnitSerial] = React.useState('')
  const [addUnitError, setAddUnitError] = React.useState('')
  const [repairUnitId, setRepairUnitId] = React.useState<string | null>(null)
  const [retireUnitId, setRetireUnitId] = React.useState<string | null>(null)
  // PR-3b: the Units-tab dropdown's "Retired" choice, confirmed before it is sent.
  const [confirmUnitRetireId, setConfirmUnitRetireId] = React.useState<string | null>(null)
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
  // PR-5 (U-10): a write anywhere (a deployment taking or returning this item) re-reads the open drawer.
  useInvalidation(['inventory', 'deployments'], () => { if (row) void loadDetail(row.id) })

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
      showToast({ message: copy('unit.approveRetirement').success, severity: 'success' })
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
  // PR-3c: a deleted item's drawer is read-only — Restore is its only action.
  const deleted = !!detail?.deletedAt
  // PR-6 (D-y/D-z): a consumable has no Units tab — unless it carries legacy units,
  // which are shown read-only. Retire is for serialized gear (D-w).
  const serialized = detail?.itemType === 'SERIALIZED'
  const legacyUnits = !serialized && (detail?.unitCounts.totalUnits ?? 0) > 0
  const showUnitsTab = serialized || legacyUnits
  const tab: DrawerTab = activeTab === 'units' && !showUnitsTab ? 'info' : activeTab
  const editable = canEdit && !deleted && !legacyUnits

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
            {deleted && detail && (
              <Alert severity="info" sx={{ mt: 1 }}>{deletedLabel(detail)} — read-only until it is restored.</Alert>
            )}
            {/* PR-2 (D-b): owned excludes retired; retired is its own number. */}
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              {detail.itemCounts.retired > 0
                ? `${detail.itemCounts.owned} owned · ${detail.itemCounts.retired} retired`
                : `${detail.itemCounts.owned} owned`}
            </Typography>
            {/* Unit count breakdown — read from itemCounts, never recounted here. */}
            <Stack direction="row" spacing={0.5} flexWrap="wrap" mt={1}>
              {detail.itemCounts.available > 0 && (
                <Chip size="small" color="success" label={`${detail.itemCounts.available} Available`} />
              )}
              {detail.itemCounts.out > 0 && (
                <Chip size="small" color="info" label={`${detail.itemCounts.out} Checked Out`} />
              )}
              {detail.itemCounts.inTransit > 0 && (
                // Outlined so "Returning" reads apart from "Checked Out" (same palette slot).
                <Chip size="small" variant="outlined" color={EQUIPMENT_STATUS.IN_TRANSIT!.color}
                  label={`${detail.itemCounts.inTransit} ${EQUIPMENT_STATUS.IN_TRANSIT!.label}`} />
              )}
              {detail.itemCounts.inMaintenance > 0 && (
                <Chip size="small" color="warning" label={`${detail.itemCounts.inMaintenance} In Maintenance`} />
              )}
              {detail.itemCounts.inoperable > 0 && (
                <Chip size="small" color="error" label={`${detail.itemCounts.inoperable} Inoperable`} />
              )}
              {detail.itemCounts.retired > 0 && (
                <Chip size="small" color="default" label={`${detail.itemCounts.retired} Retired`} />
              )}
              {detail.unitCounts.totalUnits === 0 && (
                <Chip size="small" color="default" label="No units" />
              )}
            </Stack>
          </Box>

          <Tabs value={tab} onChange={(_, v: DrawerTab) => setActiveTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Tab label="Info" value="info" />
            {/* The Units tab lists every row, retired included — so it says how many are retired. */}
            {showUnitsTab && (
              <Tab value="units" label={detail.itemCounts.retired > 0
                ? `Units (${detail.unitCounts.totalUnits} · ${detail.itemCounts.retired} retired)`
                : `Units (${detail.unitCounts.totalUnits})`} />
            )}
            <Tab label="History" value="history" />
          </Tabs>

          <Box sx={{ flex: 1, overflow: 'auto', px: 3, py: 2 }}>

            {/* ── Info Tab ── */}
            {tab === 'info' && (
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
                      {detail.expectedQuantity != null ? `${detail.itemCounts.owned} / ${detail.expectedQuantity}` : String(detail.itemCounts.owned)}
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

                {detail.itemType === 'CONSUMABLE' && !deleted && (
                  <StockByHubSection itemId={detail.id} hubs={hubs} onUpdated={() => { loadDetail(detail.id); onUpdated() }} />
                )}

                {detail.itemCounts.out > 0 && (
                  <Box mb={2}>
                    <Typography variant="subtitle2" fontWeight={600} mb={0.5}>Current Status</Typography>
                    {/* PR-5 (U-10): from the drawer's own fresh read, not the row snapshot taken when it opened. */}
                    {detail.currentOperator && <Typography variant="body2">Currently with <strong>{detail.currentOperator.name}</strong></Typography>}
                    {(row?.activeProjects ?? []).length > 0
                      ? <Stack direction="row" spacing={0.5} flexWrap="wrap" mt={0.5}>
                          <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>Projects:</Typography>
                          {(row?.activeProjects ?? []).map((p) => <Chip key={p.id} size="small" label={p.name} variant="outlined" />)}
                        </Stack>
                      : detail.currentProject && <Typography variant="body2">Checked out to <strong>{detail.currentProject.name}</strong></Typography>}
                  </Box>
                )}
              </>
            )}

            {/* ── Units Tab ── */}
            {tab === 'units' && (
              <>
                {legacyUnits && (
                  <Alert severity="info" sx={{ mb: 2 }}>Legacy units — this item is a consumable, so no more can be added.</Alert>
                )}
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
                                disabled={!editable}
                              />
                            </TableCell>
                            <TableCell>
                              {/* PR-3b (D-g): by hand a unit is only Available or Retired. Every
                                  other state comes from what happened to it (a deployment, a
                                  return, a reported problem, the review queue) and is shown as a
                                  chip with where it comes from. */}
                              {ADMIN_UNIT_STATUSES.includes(unit.status) ? (
                                <TextField
                                  select
                                  size="small"
                                  variant="standard"
                                  value={unit.status}
                                  onChange={(e) => {
                                    // Retiring releases the QR label and closes open repairs —
                                    // confirm it; un-retiring is applied directly.
                                    if (e.target.value === 'RETIRED') setConfirmUnitRetireId(unit.id)
                                    else handleUnitStatusChange(unit.id, e.target.value)
                                  }}
                                  sx={{ minWidth: 130 }}
                                  SelectProps={{ style: { fontSize: 13 } }}
                                  disabled={!editable}
                                >
                                  {ADMIN_UNIT_STATUSES.map((v) => (
                                    <MenuItem key={v} value={v}>{EQUIPMENT_STATUS[v]?.label ?? v}</MenuItem>
                                  ))}
                                </TextField>
                              ) : (
                                <Stack spacing={0.25} alignItems="flex-start">
                                  <StatusChip status={unit.status} kind="equipment" />
                                  <Typography variant="caption" color="text.secondary">{UNIT_STATUS_SOURCE[unit.status] ?? ''}</Typography>
                                </Stack>
                              )}
                            </TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                <Tooltip title="Download QR">
                                  <IconButton size="small" onClick={() => downloadUnitQR(unit, detail.name)}>
                                    <DownloadIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                {unit.status === 'INOPERABLE' && !deleted && !legacyUnits && (
                                  <MutationIconButton size="small" tooltip="Retire this unit" color="error" onClick={() => setRetireUnitId(unit.id)}>
                                    <ArchiveIcon fontSize="small" />
                                  </MutationIconButton>
                                )}
                                {/* PR-6 (D-g′): an admin starts a repair from here on any unit at
                                    the hub — Available as well as Inoperable. */}
                                {(unit.status === 'INOPERABLE' || unit.status === 'AVAILABLE') && !deleted && !legacyUnits && (
                                  <MutationIconButton size="small" tooltip="Send for repair" onClick={() => setRepairUnitId(unit.id)}>
                                    <EditIcon fontSize="small" />
                                  </MutationIconButton>
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
                {!deleted && !legacyUnits && <EditGuard>
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
                </EditGuard>}
              </>
            )}

            {/* ── History Tab ── */}
            {tab === 'history' && (
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
            {deleted ? (
              <MutationButton variant="contained" startIcon={<RestoreFromTrashIcon />}
                onClick={() => { onClose(); onRestore(detail) }}>
                Restore
              </MutationButton>
            ) : (<>
            {/* PR-3c (D-o): Delete — for mistakes, duplicates and test entries — beside
                Retire, for any item, retired included. Never in the edit form (D38). */}
            <MutationButton variant="text" color="error" startIcon={<DeleteOutlineIcon />}
              onClick={() => { onClose(); onDelete(detail) }}>
              Delete
            </MutationButton>
            {/* PR-3b (D-a): Retire for an item not already retired; the server refuses, naming
                the count, while anything is out or in repair. PR-6 (D-w): serialized gear
                only — a consumable is Edit · Delete; the absence is the rule. */}
            {serialized && detail.status !== 'RETIRED' && (
              <MutationButton variant="outlined" color="error" startIcon={<ArchiveIcon />}
                onClick={() => { onClose(); onRetire(detail) }}>
                Retire
              </MutationButton>
            )}
            <MutationButton variant="contained" startIcon={<EditIcon />}
              onClick={() => { onClose(); onEdit(detail) }}>
              Edit
            </MutationButton>
            </>)}
          </Stack>
        </Box>
      )}

      {/* Units-tab dropdown → Retired (PR-3b): the same retire as the review queue. */}
      <ConfirmDialog
        open={!!confirmUnitRetireId}
        title={copy('unit.retire').title}
        message={copy('unit.retire').message}
        confirmLabel={copy('unit.retire').confirm}
        confirmColor="error"
        onClose={() => setConfirmUnitRetireId(null)}
        onConfirm={async () => {
          const id = confirmUnitRetireId
          setConfirmUnitRetireId(null)
          if (id) await handleUnitStatusChange(id, 'RETIRED')
        }}
      />

      {/* Per-unit retire confirmation */}
      <ConfirmDialog
        open={!!retireUnitId}
        title={copy('unit.approveRetirement').title}
        message={copy('unit.approveRetirement').message}
        confirmLabel={copy('unit.approveRetirement').confirm}
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
  // D-a (list half): a RETIRED item is hidden behind this switch, not deleted.
  // Component state, not the URL — the jsdom harness mocks `next/navigation`
  // statically, so a URL-only switch would be untestable here.
  const [includeRetired, setIncludeRetired] = React.useState(false)
  const [categories, setCategories] = React.useState<CategoryOption[]>([])
  const [hubs, setHubs] = React.useState<HubOption[]>([])
  const [operators, setOperators] = React.useState<UserOption[]>([])
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([])
  const [formItem, setFormItem] = React.useState<InventoryItemRow | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [detailRow, setDetailRow] = React.useState<DrawerRow | null>(null)
  const [retireItem, setRetireItem] = React.useState<InventoryItemRow | null>(null)
  // The row just created, pinned above the list until the reader moves on.
  const [justAdded, setJustAdded] = React.useState<InventoryItemRow | null>(null)
  // PR-3c (D-o): "Show deleted" replaces the list with deleted items (admin only;
  // component state for the same reason as includeRetired).
  const [showDeleted, setShowDeleted] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<InventoryItemRow | null>(null)
  const [factsFor, setFactsFor] = React.useState<{ id: string; facts: DeleteFacts } | null>(null)
  const deleteFacts = deleteTarget && factsFor?.id === deleteTarget.id ? factsFor.facts : null
  // PR-3c (D-p): bulk delete — select rows on this page, "Delete selected".
  const selection = useMultiSelect()
  const [bulkConfirm, setBulkConfirm] = React.useState(false)
  const [refusals, setRefusals] = React.useState<{ id: string; name: string; error: string }[]>([])
  const [refusalsOpen, setRefusalsOpen] = React.useState(false)
  const selectable = canEdit && !showDeleted
  const cols = selectable ? 8 : 7

  // PR-1a (B2/L-4): one paged read with the server's real `total`. The page used
  // to fetch 25 rows, regroup them under category headers and show them with no
  // count and no pager — so the whole inventory looked like 25 items, and a newly
  // added item alphabetically past the cut simply did not appear.
  const listParams = React.useMemo(() => ({
    q: debouncedSearch || undefined,
    categoryId: categoryFilter || undefined,
    itemType: itemTypeFilter || undefined,
    hubId: hubFilter || undefined,
    operatorId: operatorFilter || undefined,
    projectId: projectFilter || undefined,
    includeRetired: includeRetired && !showDeleted ? '1' : undefined,
    deleted: showDeleted ? '1' : undefined,
  }), [debouncedSearch, categoryFilter, itemTypeFilter, hubFilter, operatorFilter, projectFilter, includeRetired, showDeleted])

  const q = useListQuery<InventoryItemRow>({ endpoint: '/api/inventory', params: listParams })
  const total = q.total
  const loading = q.loading
  const reload = q.reload
  const load = React.useCallback(() => { void reload({ bypassCache: true }) }, [reload])
  const setPage = q.setPage
  const page = q.page

  React.useEffect(() => {
    fetch('/api/inventory/categories').then((r) => r.json()).then((d) => setCategories(d.data ?? [])).catch(() => {})
    fetch('/api/inventory/hubs').then((r) => r.json()).then((d) => setHubs(d.data ?? [])).catch(() => {})
    fetch('/api/users').then((r) => r.json()).then((d) => {
      const all = d.data ?? []
      setOperators(all.filter((u: UserOption) => u.role === 'OPERATOR' || u.role === 'ADMIN'))
    }).catch(() => {})
    fetch('/api/projects').then((r) => r.json()).then((d) => setProjects(d.data ?? d ?? [])).catch(() => {})
  }, [])

  // The pin is a one-shot: the moment the reader searches, filters or pages, it
  // goes — it would otherwise sit at the top of a list it does not belong to.
  const justAddedId = justAdded?.id ?? null
  // Keyed on the list query only — React bails out when it is already null.
  // A selection belongs to the page it was made on, so it goes with it (PR-3c).
  const clearSelection = selection.clear
  React.useEffect(() => { setJustAdded(null); clearSelection() }, [listParams, page, clearSelection])

  // Shown once, under the pin — never twice.
  const rows = React.useMemo(
    () => (justAddedId ? q.rows.filter((i) => i.id !== justAddedId) : q.rows),
    [q.rows, justAddedId],
  )

  const handleRetire = async () => {
    if (!retireItem) return
    const res = await fetch(`/api/inventory/${retireItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RETIRED' }),
    })
    setRetireItem(null)
    if (res.ok) { showToast({ message: copy('item.retire').success(retireItem.name), severity: 'success' }); load(); return }
    // PR-3b: the 409 names what blocks it ("2 units are still out or in repair — …").
    const d = await res.json().catch(() => ({}))
    showToast({ message: apiErrorMessage(d, 'Failed to retire item'), severity: 'error' })
  }

  // PR-3c: what the Delete dialog lists, read when it opens.
  React.useEffect(() => {
    if (!deleteTarget) return
    const id = deleteTarget.id
    let live = true
    fetch(`/api/inventory/${id}/references`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d?.data) setFactsFor({ id, facts: d.data as DeleteFacts }) })
      .catch(() => {})
    return () => { live = false }
  }, [deleteTarget])

  const restoreItem = async (item: { id: string; name: string }) => {
    const res = await fetch(`/api/inventory/${item.id}/restore`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { showToast({ message: apiErrorMessage(d, 'Could not restore the item'), severity: 'error' }); return }
    load()
    showToast({ message: copy('item.restore').success(item.name), severity: 'success' })
  }

  const handleDelete = async () => {
    const item = deleteTarget
    if (!item) return
    const res = await fetch(`/api/inventory/${item.id}`, { method: 'DELETE' })
    setDeleteTarget(null)
    const d = await res.json().catch(() => ({}))
    // The 409 names what is in the way ("2 open repairs — close them first.").
    if (!res.ok) { showToast({ message: apiErrorMessage(d, 'Could not delete the item'), severity: 'error' }); return }
    if (justAdded?.id === item.id) setJustAdded(null)
    if (selection.isSelected(item.id)) selection.toggle(item.id)
    load()
    showToast({
      message: copy('item.delete').success(item.name),
      severity: 'success',
      action: { label: copy('item.delete').undo, onClick: () => { void restoreItem(item) } },
    })
  }

  const pageIds = rows.map((r) => r.id)
  const selectedNames = [...(justAdded ? [justAdded] : []), ...rows]
    .filter((r) => selection.isSelected(r.id))
    .map((r) => r.name)

  // D-p: one transaction per item on the server, so the answer is per item. Refused
  // rows stay selected — they are what is left to deal with.
  const handleBulkDelete = async () => {
    const ids = [...selection.selected]
    const res = await fetch('/api/inventory/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    setBulkConfirm(false)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { showToast({ message: apiErrorMessage(d, 'Could not delete the selected items'), severity: 'error' }); return }
    const results = (d.results ?? []) as { id: string; name: string; ok: boolean; error?: string }[]
    const deletedIds = results.filter((r) => r.ok).map((r) => r.id)
    const refused = results.filter((r) => !r.ok).map((r) => ({ id: r.id, name: r.name, error: r.error ?? '' }))
    selection.clear()
    refused.forEach((r) => selection.toggle(r.id))
    if (justAdded && deletedIds.includes(justAdded.id)) setJustAdded(null)
    setRefusals(refused)
    load()
    showToast({
      message: copy('item.bulkDelete').success(deletedIds.length, refused.length),
      severity: refused.length > 0 ? 'warning' : 'success',
      ...(refused.length > 0 && { action: { label: copy('item.bulkDelete').details, onClick: () => setRefusalsOpen(true) } }),
    })
  }

  // UXP-6 (6c): "<name> added · Open" (the drawer), or — when a serialized item's
  // units could not be created (T4) — straight to its Units tab with the error.
  const handleItemSaved = (saved: ItemSaved, { isEdit, unitsError }: ItemSavedInfo) => {
    load()
    // PR-1a (B2/U-12): the created row is pinned at the top under "Just added".
    // A new item lands wherever its name sorts — past the page cut it was simply
    // not there, which read as "the save did not work". The POST returns a raw row
    // without counts (and a serialized item's units are created AFTER it), so the
    // pinned row is re-read from `GET /api/inventory/<id>`.
    if (!isEdit) {
      void (async () => {
        try {
          const res = await fetch(`/api/inventory/${saved.id}`)
          if (!res.ok) return
          const json = await res.json()
          if (json?.data) setJustAdded(json.data as InventoryItemRow)
        } catch {
          /* non-fatal — the row still arrives with the next list read */
        }
      })()
    }
    if (unitsError) {
      setDetailRow({ id: saved.id, openOn: 'units', unitsError })
      return
    }
    showToast({
      message: copy('item.save').success(saved.name, isEdit),
      severity: 'success',
      action: { label: 'Open', onClick: () => setDetailRow({ id: saved.id }) },
    })
  }

  // One row renderer for both the pinned "Just added" row and the list, so the
  // two can never drift. `isNew` adds the chip that explains why it is at the top.
  const itemRow = (item: InventoryItemRow, isNew: boolean) => (
    <TableRow
      key={isNew ? `__new__${item.id}` : item.id}
      hover
      sx={{ cursor: 'pointer', ...(isNew && { bgcolor: 'action.hover' }) }}
      onClick={() => setDetailRow(item)}
    >
      {selectable && (
        <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            size="small"
            checked={selection.isSelected(item.id)}
            onChange={() => selection.toggle(item.id)}
            inputProps={{ 'aria-label': `Select ${item.name}` }}
          />
        </TableCell>
      )}
      <TableCell>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" fontWeight={500}>{item.name}</Typography>
          {isNew && <Chip size="small" color="success" variant="outlined" label="New" />}
          {item.deletedAt && <Chip size="small" variant="outlined" label={deletedLabel(item)} />}
          {item.itemType === 'SERIALIZED' && (
            <StatusChip label="S" variant="outlined" color="primary" />
          )}
          {item.status === 'RETIRED' && <StatusChip status="RETIRED" kind="equipment" />}
          {item.itemCounts.inoperable > 0 && (
            <Tooltip title={`${item.itemCounts.inoperable} inoperable`}>
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
        {/* PR-2 (B3/C-7/C-10): Available · Out · Total = available · out · owned, straight from the server. */}
        <Chip size="small" label={item.itemCounts.available} color="success" variant="outlined" />
      </TableCell>
      <TableCell align="center">
        <Chip size="small" label={item.itemCounts.out} color={item.itemCounts.out > 0 ? 'info' : 'default'} variant="outlined" />
      </TableCell>
      <TableCell align="center">
        <Typography variant="body2">{item.itemCounts.owned}</Typography>
      </TableCell>
      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
        {item.deletedAt ? (
          // PR-3c: a deleted row's only action is Restore.
          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
            <MutationIconButton size="small" tooltip="Restore" onClick={() => { void restoreItem(item) }}>
              <RestoreFromTrashIcon fontSize="small" />
            </MutationIconButton>
          </Stack>
        ) : (
        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
          <MutationIconButton size="small" tooltip="Edit" onClick={() => { setFormItem(item); setFormOpen(true) }}>
            <EditIcon fontSize="small" />
          </MutationIconButton>
          {item.itemType === 'SERIALIZED' && item.status !== 'RETIRED' && (
            <MutationIconButton size="small" tooltip="Retire" color="error" onClick={() => setRetireItem(item)}>
              <ArchiveIcon fontSize="small" />
            </MutationIconButton>
          )}
          <MutationIconButton size="small" tooltip="Delete" color="error" onClick={() => setDeleteTarget(item)}>
            <DeleteOutlineIcon fontSize="small" />
          </MutationIconButton>
        </Stack>
        )}
      </TableCell>
    </TableRow>
  )

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

      {/* Filters.
          PR-1a: a URL-backed filter change calls `setFilters` and NOTHING ELSE —
          the `page: ''` in the patch clears the page key in that one
          history-replace, and `useListQuery` zeroes its own page when the filter
          set changes. Adding `setPage(0)` here would issue a SECOND
          `router.replace`, built from a `window.location` Next has not committed
          yet, which lands last and silently reverts the filter. The two
          component-state filters below (search, Show retired) have no competing
          replace, so they call `setPage(0)` to clear a stale `?page=`. */}
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
              onClick={() => setFilters({ itemType: type, page: '' })}
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
            onChange={(e) => setFilters({ categoryId: e.target.value, page: '' })}
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
            onChange={(e) => setFilters({ hubId: e.target.value, page: '' })}
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
            onChange={(e) => setFilters({ operatorId: e.target.value, page: '' })}
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
            onChange={(e) => setFilters({ projectId: e.target.value, page: '' })}
            sx={{ width: 180 }}
          >
            <MenuItem value="">All projects</MenuItem>
            {projects.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
        )}
        {/* D-a (list half): retired items are hidden, not deleted — this is the
            door to them. Retiring is real since PR-3b (units on hand retired, refused
            while any are out); Clear filters turns this back off. */}
        {!showDeleted && (
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={includeRetired}
              onChange={(e) => { setIncludeRetired(e.target.checked); setPage(0) }}
            />
          }
          label={<Typography variant="body2">Show retired</Typography>}
        />
        )}
        {/* PR-3c (D-o): the door to deleted items — the view replaces the list. */}
        {canEdit && (
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showDeleted}
                onChange={(e) => { setShowDeleted(e.target.checked); setPage(0) }}
              />
            }
            label={<Typography variant="body2">Show deleted</Typography>}
          />
        )}
        {(categoryFilter || itemTypeFilter || hubFilter || operatorFilter || projectFilter || search || includeRetired || showDeleted) && (
          <Button size="small" variant="text" onClick={() => {
            setSearch('')
            setIncludeRetired(false)
            setShowDeleted(false)
            setFilters({ categoryId: '', itemType: '', hubId: '', operatorId: '', projectId: '', page: '' })
          }}>Clear filters</Button>
        )}
      </Stack>

      {/* Table */}
      <PagedTable
        colSpan={cols}
        total={total}
        page={q.page}
        pageSize={q.pageSize}
        truncated={q.truncated}
        loading={loading}
        onPageChange={setPage}
        onPageSizeChange={q.setPageSize}
        itemNoun="items"
        emptyMessage={showDeleted ? 'No deleted items.' : `No items found${search ? ` for "${search}"` : ''}.`}
        head={
          <TableRow sx={{ '& th': { fontWeight: 600, fontSize: 12, color: 'text.secondary' } }}>
            {selectable && (
              <TableCell padding="checkbox">
                {/* "Select all" is this page only — the table is grouped by category. */}
                <Checkbox
                  size="small"
                  checked={selection.allSelected(pageIds)}
                  indeterminate={selection.count > 0 && !selection.allSelected(pageIds)}
                  onChange={() => selection.toggleAll(pageIds)}
                  inputProps={{ 'aria-label': `Select all ${pageIds.length} on this page` }}
                />
              </TableCell>
            )}
            <TableCell>Name</TableCell>
            <TableCell>Category</TableCell>
            <TableCell>Hub</TableCell>
            <TableCell align="center">Available</TableCell>
            <TableCell align="center">Out</TableCell>
            <TableCell align="center">Total</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        }
      >
        {justAdded && [
          <TableRow key="__hdr__just-added">
            <TableCell colSpan={cols} sx={{ bgcolor: 'grey.50', py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.6 }}>Just added</Typography>
            </TableCell>
          </TableRow>,
          itemRow(justAdded, true),
        ]}
        {groupBy(
          rows,
          (item) => (typeof item.category === 'object' ? item.category?.name : (item.category as unknown as string)) ?? 'Uncategorized',
        ).flatMap(({ group, items: gi }) => [
          <TableRow key={`__hdr__${group}`}>
            <TableCell colSpan={cols} sx={{ bgcolor: 'grey.50', py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.6 }}>{group}</Typography>
            </TableCell>
          </TableRow>,
          ...gi.map((item) => itemRow(item, false)),
        ])}
      </PagedTable>

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
        onDelete={(item) => setDeleteTarget(item)}
        onRestore={(item) => { void restoreItem(item) }}
        onUpdated={load}
      />

      {/* Retire confirm */}
      <ConfirmDialog
        open={!!retireItem}
        title={copy('item.retire').title}
        message={copy('item.retire').message(retireItem?.name ?? '')}
        confirmLabel={copy('item.retire').confirm}
        confirmColor="error"
        onClose={() => setRetireItem(null)}
        onConfirm={handleRetire}
      />

      {/* PR-3c: Delete confirm — the rule a user needs (D-s), then what goes with it. */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={copy(deleteTarget?.itemType === 'CONSUMABLE' ? 'item.deleteConsumable' : 'item.delete').title}
        message={copy(deleteTarget?.itemType === 'CONSUMABLE' ? 'item.deleteConsumable' : 'item.delete').message(deleteTarget?.name ?? '')}
        details={(
          // PR-5 (point fix): the details read lands after the dialog opens; the space for
          // its (at most three) lines is reserved up front so the Delete button never moves
          // under the cursor.
          <Stack spacing={0.5} mt={1.5} sx={{ minHeight: DELETE_DETAILS_MIN_HEIGHT }} data-testid="delete-details">
            {(deleteFacts ? deleteDetailLines(deleteFacts) : []).map((line) => (
              <Typography key={line} variant="body2" color="text.secondary">{line}</Typography>
            ))}
          </Stack>
        )}
        confirmLabel={copy(deleteTarget?.itemType === 'CONSUMABLE' ? 'item.deleteConsumable' : 'item.delete').confirm}
        confirmColor="error"
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      {/* PR-3c (D-p): bulk delete */}
      {selectable && (
        <BulkActionBar
          count={selection.count}
          noun="item"
          onClear={selection.clear}
          actions={[{ label: copy('item.bulkDelete').action, color: 'error', onClick: () => setBulkConfirm(true) }]}
        />
      )}
      <ConfirmDialog
        open={bulkConfirm}
        title={copy('item.bulkDelete').title}
        message={copy('item.bulkDelete').message(selection.count, selectedNames)}
        confirmLabel={copy('item.bulkDelete').confirm}
        confirmColor="error"
        onClose={() => setBulkConfirm(false)}
        onConfirm={handleBulkDelete}
      />
      <Dialog open={refusalsOpen} onClose={() => setRefusalsOpen(false)} maxWidth="xs" fullWidth aria-labelledby="refusals-title">
        <DialogTitle id="refusals-title">{copy('item.bulkDelete').refusalsTitle}</DialogTitle>
        <DialogContent>
          <List dense>
            {refusals.map((r) => (
              <ListItem key={r.id} disableGutters>
                <ListItemText primary={r.name} secondary={r.error} />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRefusalsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
