'use client'

import * as React from 'react'
import { useUrlFilters } from '@/hooks/useUrlFilters'
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Stack, Alert,
  Chip, IconButton, Tooltip, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Skeleton, Switch, FormControlLabel, Accordion, AccordionSummary,
  AccordionDetails, Divider, TablePagination,
  FormControl, FormLabel, RadioGroup, Radio, Link, Tabs, Tab,
} from '@mui/material'
import { StatusChip } from '@/components/shared/StatusChip'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
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

function ItemFormDialog({
  item, categories, hubs, onClose, onSuccess,
}: {
  item: InventoryItemRow | null; categories: CategoryOption[]; hubs: HubOption[]
  onClose: () => void; onSuccess: (msg: string) => void
}) {
  const isEdit = !!item
  const [name, setName] = React.useState('')
  const [itemType, setItemType] = React.useState('CONSUMABLE')
  const [unitId, setUnitId] = React.useState('')
  const [categoryId, setCategoryId] = React.useState('')
  const [hubId, setHubId] = React.useState('')
  const [quantity, setQuantity] = React.useState(1)
  const [expectedQuantity, setExpectedQuantity] = React.useState('')
  const [lowStockThreshold, setLowStockThreshold] = React.useState('')
  const [unitCost, setUnitCost] = React.useState('')
  const [supplier, setSupplier] = React.useState('')
  const [reorderUrl, setReorderUrl] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (item) {
      setName(item.name); setItemType(item.itemType); setUnitId(item.unitId ?? '')
      // Only set categoryId if it's a real CUID, not an enum fallback like 'SAMPLING_EQUIPMENT'
      setCategoryId(/^[A-Z_]+$/.test(item.category.id) ? '' : item.category.id)
      setHubId(item.hub?.id ?? '')
      setQuantity(item.quantity)
      setExpectedQuantity(item.expectedQuantity != null ? String(item.expectedQuantity) : '')
      setLowStockThreshold(item.lowStockThreshold != null ? String(item.lowStockThreshold) : '')
      setUnitCost(item.unitCost != null ? String(item.unitCost) : '')
      setSupplier(item.supplier ?? ''); setReorderUrl(item.reorderUrl ?? ''); setNotes(item.notes ?? '')
    } else {
      setName(''); setItemType('CONSUMABLE'); setUnitId(''); setCategoryId('')
      setHubId(''); setQuantity(1)
      setExpectedQuantity(''); setLowStockThreshold('')
      setUnitCost(''); setSupplier(''); setReorderUrl(''); setNotes('')
    }
    setError('')
  }, [item])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const body: Record<string, unknown> = { name, categoryId, itemType, ...(!isEdit && { quantity }) }
      if (itemType === 'SERIALIZED' && unitId) body.unitId = unitId
      if (hubId) body.hubId = hubId
      if (expectedQuantity !== '') body.expectedQuantity = parseInt(expectedQuantity)
      if (lowStockThreshold !== '') body.lowStockThreshold = parseInt(lowStockThreshold)
      if (unitCost !== '') body.unitCost = parseFloat(unitCost)
      if (supplier) body.supplier = supplier
      if (reorderUrl) body.reorderUrl = reorderUrl
      if (notes) body.notes = notes
      const url = isEdit ? `/api/inventory/${item!.id}` : '/api/inventory'
      const res = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { setError(typeof data.error === 'object' ? JSON.stringify(data.error) : (data.error ?? 'Failed to save')); return }
      onSuccess(isEdit ? `${name} updated` : `${name} added`)
      onClose()
    } catch { setError('Network error. Please try again.') }
    finally { setLoading(false) }
  }

  return (
    <Dialog open={true} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? `Edit ${item!.name}` : 'Add Item'}</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2.5} pt={0.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth autoFocus />
            <FormControl>
              <FormLabel>Item Type</FormLabel>
              <RadioGroup row value={itemType} onChange={(e) => setItemType(e.target.value)}>
                <FormControlLabel value="CONSUMABLE" control={<Radio />} label="Consumable" />
                <FormControlLabel value="SERIALIZED" control={<Radio />} label="Serialized Item" />
              </RadioGroup>
            </FormControl>
            {itemType === 'SERIALIZED' && (
              <TextField label="Unit / Serial Number" value={unitId} onChange={(e) => setUnitId(e.target.value)} fullWidth
                helperText="e.g. GPS-003, DRILL-01 — this will link to a QR sticker" />
            )}
            <TextField select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} fullWidth
              required={!isEdit}
              helperText={categories.length === 0 ? 'No categories set up yet — categories are created automatically when inventory is imported.' : undefined}>
              {categories.length === 0
                ? <MenuItem value="" disabled>No categories available</MenuItem>
                : categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)
              }
            </TextField>
            <TextField select label="Hub Location" value={hubId} onChange={(e) => setHubId(e.target.value)} fullWidth>
              <MenuItem value="">Unknown</MenuItem>
              {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.city}, {h.state}</MenuItem>)}
            </TextField>
            {isEdit ? (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {itemType === 'CONSUMABLE' ? 'Total Stock' : 'Total Units'}
                </Typography>
                <Typography variant="body2">
                  {itemType === 'CONSUMABLE'
                    ? `${item?.quantity ?? 0} total (managed per hub — use Stock by Hub below)`
                    : `${item?.unitCounts?.totalUnits ?? item?.quantity ?? 0} (managed in Units tab)`}
                </Typography>
              </Box>
            ) : (
              <TextField label="Initial Quantity" type="number" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value) || 0)} required fullWidth inputProps={{ min: 0 }} />
            )}
            <TextField label="Expected / Total Quantity" type="number" value={expectedQuantity} onChange={(e) => setExpectedQuantity(e.target.value)} fullWidth inputProps={{ min: 0 }}
              helperText="How many of this item should exist in total? Used to spot shrinkage." />
            <TextField label="Low Stock Alert Threshold" type="number" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} fullWidth inputProps={{ min: 0 }}
              helperText="Show a warning when available unit count falls to or below this number." />
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="body2">Purchasing Info</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <TextField label="Unit Cost ($)" type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} fullWidth inputProps={{ min: 0, step: '0.01' }} />
                  <TextField label="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} fullWidth />
                  <TextField label="Reorder URL" value={reorderUrl} onChange={(e) => setReorderUrl(e.target.value)} fullWidth />
                </Stack>
              </AccordionDetails>
            </Accordion>
            <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline rows={3} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}>
            {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Item'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
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
  const [fromHubId, setFromHubId] = React.useState('')
  const [toHubId, setToHubId] = React.useState('')
  const [qty, setQty] = React.useState(1)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  const hubsWithStock = stock.filter((s) => s.quantity > 0)
  const fromAvailable = stock.find((s) => s.hubId === fromHubId)?.available ?? 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!fromHubId || !toHubId) { setError('Select both hubs'); return }
    if (fromHubId === toHubId) { setError('Source and destination must differ'); return }
    if (qty < 1) { setError('Quantity must be at least 1'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/inventory/${itemId}/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromHubId, toHubId, qty }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(res.status === 409 ? `Not enough stock at source hub (only ${fromAvailable} available)` : (typeof data.error === 'string' ? data.error : 'Move failed'))
        return
      }
      onSuccess()
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Move Stock</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2.5} pt={0.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField select label="From hub" value={fromHubId} onChange={(e) => setFromHubId(e.target.value)} fullWidth required>
              {hubsWithStock.length === 0
                ? <MenuItem value="" disabled>No hubs with stock</MenuItem>
                : hubsWithStock.map((s) => (
                    <MenuItem key={s.hubId} value={s.hubId}>
                      {s.hubName ?? s.hubId} ({s.available} available)
                    </MenuItem>
                  ))}
            </TextField>
            <TextField select label="To hub" value={toHubId} onChange={(e) => setToHubId(e.target.value)} fullWidth required>
              {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name}</MenuItem>)}
            </TextField>
            <TextField
              label="Quantity"
              type="number"
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              inputProps={{ min: 1, max: fromAvailable || undefined }}
              fullWidth
              required
              helperText={fromHubId ? `${fromAvailable} available at source` : undefined}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={loading}>Cancel</Button>
          <MutationButton type="submit" variant="contained" disabled={loading} startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SwapHorizIcon />}>
            {loading ? 'Moving…' : 'Move'}
          </MutationButton>
        </DialogActions>
      </Box>
    </Dialog>
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
  const [hubId, setHubId] = React.useState('')
  const [qty, setQty] = React.useState(1)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!hubId) { setError('Select a hub'); return }
    if (qty < 1) { setError('Quantity must be at least 1'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/inventory/${itemId}/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Additive receive (race-safe) — see the stock route's receiveSchema.
        body: JSON.stringify({ hubId, addQty: qty }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Could not add stock'); return }
      onSuccess()
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add Stock at a Hub</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2.5} pt={0.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField select label="Hub" value={hubId} onChange={(e) => setHubId(e.target.value)} fullWidth required>
              {availableHubs.length === 0
                ? <MenuItem value="" disabled>Every hub already has a stock row — edit it in the table instead</MenuItem>
                : availableHubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name ?? h.id}</MenuItem>)}
            </TextField>
            <TextField label="Quantity" type="number" value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 0)} inputProps={{ min: 1 }} fullWidth required />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading || !hubId}>{loading ? <CircularProgress size={16} /> : 'Add Stock'}</Button>
        </DialogActions>
      </Box>
    </Dialog>
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

function ItemDetailDrawer({
  row, hubs, onClose, onEdit, onRetire, onUpdated,
}: {
  row: InventoryItemRow | null
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
    if (!row) { setDetail(null); setActiveTab(0); return }
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
  const [detailRow, setDetailRow] = React.useState<InventoryItemRow | null>(null)
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
          item={formItem}
          categories={categories}
          hubs={hubs}
          onClose={() => setFormOpen(false)}
          onSuccess={(msg) => { showToast({ message: msg, severity: 'success' }); load() }}
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
