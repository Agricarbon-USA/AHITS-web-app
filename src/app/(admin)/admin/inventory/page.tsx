'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Stack, Alert,
  Chip, IconButton, Tooltip, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Skeleton, Switch, FormControlLabel, Accordion, AccordionSummary,
  AccordionDetails, Drawer, Divider, TablePagination,
  FormControl, FormLabel, RadioGroup, Radio, Link, Tabs, Tab,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import ArchiveIcon from '@mui/icons-material/Archive'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import DownloadIcon from '@mui/icons-material/Download'
import HistoryIcon from '@mui/icons-material/History'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import QRCode from 'qrcode'
import { useToast } from '@/components/shared/useToast'

// ── Helper maps ───────────────────────────────────────────────────

const STATUS_CHIP_COLOR: Record<string, 'success' | 'info' | 'primary' | 'warning' | 'default' | 'error'> = {
  AVAILABLE: 'success',
  CHECKED_OUT: 'info',
  IN_MAINTENANCE: 'warning',
  INOPERABLE: 'error',
  RETIRED: 'default',
}

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Available',
  CHECKED_OUT: 'Checked Out',
  IN_MAINTENANCE: 'In Maintenance',
  INOPERABLE: 'Inoperable',
  RETIRED: 'Retired',
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
  unitCounts: UnitCounts
  units: UnitRow[]
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

// ── Confirm Dialog ────────────────────────────────────────────────

function ConfirmDialog({
  open, title, message, confirmLabel, confirmColor, onClose, onConfirm,
}: {
  open: boolean; title: string; message: string; confirmLabel: string
  confirmColor?: 'error' | 'warning' | 'primary'; onClose: () => void; onConfirm: () => Promise<void>
}) {
  const [loading, setLoading] = React.useState(false)
  const handle = async () => { setLoading(true); await onConfirm(); setLoading(false) }
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent><Typography>{message}</Typography></DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" color={confirmColor ?? 'primary'} onClick={handle} disabled={loading}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}>
          {loading ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Repair Dialog (admin review — per unit) ───────────────────────

function RepairReviewDialog({
  open, itemId, unitId, hubs, onClose, onSuccess,
}: {
  open: boolean; itemId: string; unitId: string; hubs: HubOption[]
  onClose: () => void; onSuccess: () => void
}) {
  const [repairType, setRepairType] = React.useState('')
  const [shopName, setShopName] = React.useState('')
  const [shopAddress, setShopAddress] = React.useState('')
  const [dateDelivered, setDateDelivered] = React.useState('')
  const [purchaseOrder, setPurchaseOrder] = React.useState('')
  const [invoiceNumber, setInvoiceNumber] = React.useState('')
  const [repairHubId, setRepairHubId] = React.useState('')
  const [note, setNote] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (!open) {
      setRepairType(''); setShopName(''); setShopAddress(''); setDateDelivered('')
      setPurchaseOrder(''); setInvoiceNumber(''); setRepairHubId(''); setNote(''); setError('')
    }
  }, [open])

  const handleSubmit = async () => {
    if (!repairType) { setError('Select a repair type'); return }
    if (!note.trim()) { setError('Note is required'); return }
    setLoading(true); setError('')
    const res = await fetch(`/api/inventory/${itemId}/review-inoperable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unitId,
        decision: 'REPAIR', repairType, note,
        shopName: shopName || undefined,
        shopAddress: shopAddress || undefined,
        dateDelivered: dateDelivered || undefined,
        purchaseOrder: purchaseOrder || undefined,
        invoiceNumber: invoiceNumber || undefined,
        repairHubId: repairHubId || undefined,
      }),
    })
    setLoading(false)
    if (res.ok) { onSuccess() }
    else { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Failed') }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Send for Repair</DialogTitle>
      <DialogContent>
        <Stack spacing={2} pt={0.5}>
          {error && <Alert severity="error">{error}</Alert>}
          <FormControl required>
            <FormLabel>Repair Method</FormLabel>
            <RadioGroup value={repairType} onChange={(e) => setRepairType(e.target.value)}>
              <FormControlLabel value="IN_FIELD" control={<Radio />} label="Fix it in the field" />
              <FormControlLabel value="AT_SHOP" control={<Radio />} label="Take it to a shop" />
              <FormControlLabel value="SHIP_TO_HUB" control={<Radio />} label="Ship it to a hub" />
              <FormControlLabel value="SHIP_FOR_REPAIR" control={<Radio />} label="Ship for external repair" />
            </RadioGroup>
          </FormControl>
          {(repairType === 'AT_SHOP' || repairType === 'SHIP_FOR_REPAIR') && (
            <Stack spacing={1.5}>
              <TextField size="small" label="Shop Name (optional)" value={shopName} onChange={(e) => setShopName(e.target.value)} fullWidth />
              <TextField size="small" label="Shop Address (optional)" value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} fullWidth />
              <TextField size="small" label="Date Delivered (optional)" type="date" value={dateDelivered} onChange={(e) => setDateDelivered(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
              <TextField size="small" label="Purchase Order (optional)" value={purchaseOrder} onChange={(e) => setPurchaseOrder(e.target.value)} fullWidth />
              <TextField size="small" label="Invoice # (optional)" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} fullWidth />
            </Stack>
          )}
          {repairType === 'SHIP_TO_HUB' && (
            <Stack spacing={1.5}>
              <TextField select label="Ship to Hub" value={repairHubId} onChange={(e) => setRepairHubId(e.target.value)} fullWidth required>
                {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name} — {h.city}, {h.state}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Date Shipped (optional)" type="date" value={dateDelivered} onChange={(e) => setDateDelivered(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
            </Stack>
          )}
          <TextField label="Admin note (required)" value={note} onChange={(e) => setNote(e.target.value)} multiline rows={2} fullWidth required />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={loading}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}>
          {loading ? 'Saving…' : 'Send for Repair'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

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
            <TextField select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required fullWidth>
              {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
            <TextField select label="Hub Location" value={hubId} onChange={(e) => setHubId(e.target.value)} fullWidth>
              <MenuItem value="">Unknown</MenuItem>
              {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.city}, {h.state}</MenuItem>)}
            </TextField>
            {isEdit ? (
              <Box>
                <Typography variant="caption" color="text.secondary">Total Units</Typography>
                <Typography variant="body2">{item?.unitCounts?.totalUnits ?? item?.quantity ?? 0} (managed in Units tab)</Typography>
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

// ── Detail Drawer ─────────────────────────────────────────────────

async function downloadUnitQR(unit: { qrCodeId: string; serialNumber: string | null }, itemName: string) {
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, unit.qrCodeId, { width: 300 })
  const link = document.createElement('a')
  link.download = `qr-${itemName.replace(/\s+/g, '-')}-${unit.qrCodeId.slice(0, 8)}.png`
  link.href = canvas.toDataURL()
  link.click()
}

function DetailDrawer({
  row, hubs, onClose, onEdit, onRetire, onUpdated,
}: {
  row: InventoryItemRow | null
  hubs: HubOption[]
  onClose: () => void
  onEdit: (item: InventoryItemRow) => void
  onRetire: (item: InventoryItemRow) => void
  onUpdated: () => void
}) {
  const [detail, setDetail] = React.useState<ItemDetail | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState(0)
  const [serialEdits, setSerialEdits] = React.useState<Record<string, string>>({})
  const [addingUnit, setAddingUnit] = React.useState(false)
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
    await fetch(`/api/inventory/units/${unitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (row) loadDetail(row.id)
  }

  const handleSerialBlur = async (unitId: string) => {
    const sn = serialEdits[unitId]
    if (sn === undefined) return
    await fetch(`/api/inventory/units/${unitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serialNumber: sn || null }),
    })
    setSerialEdits((prev) => { const n = { ...prev }; delete n[unitId]; return n })
    if (row) loadDetail(row.id)
  }

  const handleAddUnit = async () => {
    if (!detail) return
    setAddingUnit(true)
    await fetch(`/api/inventory/${detail.id}/units`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 1 }),
    })
    setAddingUnit(false)
    loadDetail(detail.id)
    onUpdated()
  }

  const handleApproveRetirement = async () => {
    if (!detail || !retireUnitId) return
    await fetch(`/api/inventory/${detail.id}/review-inoperable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unitId: retireUnitId, decision: 'RETIRE', note: 'Approved for retirement by admin' }),
    })
    setRetireUnitId(null)
    loadDetail(detail.id)
    onUpdated()
  }

  const damagePhotos = detail?.photos.filter((p) => p.context === 'DAMAGE') ?? []

  return (
    <Drawer anchor="right" open={!!row} onClose={onClose} PaperProps={{ sx: { width: 540 } }}>
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
                  <Stack direction="row" spacing={1} flexWrap="wrap" mb={2}>
                    {damagePhotos.map((p) => (
                      <Box key={p.id} component="img" src={p.url} alt="damage"
                        sx={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }} />
                    ))}
                  </Stack>
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

                {detail.unitCounts.checkedOut > 0 && (
                  <Box mb={2}>
                    <Typography variant="subtitle2" fontWeight={600} mb={0.5}>Current Status</Typography>
                    {row?.currentOperator && <Typography variant="body2">Currently with <strong>{row.currentOperator.name}</strong></Typography>}
                    {row?.currentProject && <Typography variant="body2">Checked out to <strong>{row.currentProject.name}</strong></Typography>}
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
                              >
                                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                                  <MenuItem key={v} value={v}>{l}</MenuItem>
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
                                    <Tooltip title="Retire this unit">
                                      <IconButton size="small" color="error" onClick={() => setRetireUnitId(unit.id)}>
                                        <ArchiveIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Send for repair">
                                      <IconButton size="small" onClick={() => setRepairUnitId(unit.id)}>
                                        <EditIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
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
                                            {new Date(log.submittedAt).toLocaleDateString()}
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
                <Button
                  size="small"
                  startIcon={addingUnit ? <CircularProgress size={14} /> : <AddIcon />}
                  onClick={handleAddUnit}
                  disabled={addingUnit}
                  variant="outlined"
                >
                  {addingUnit ? 'Adding…' : '+ Add Unit'}
                </Button>
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
                          {new Date(log.submittedAt).toLocaleDateString()}
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
              <Button variant="outlined" color="error" startIcon={<ArchiveIcon />}
                onClick={() => { onClose(); onRetire(detail) }}>
                Retire
              </Button>
            )}
            <Button variant="contained" startIcon={<EditIcon />}
              onClick={() => { onClose(); onEdit(detail) }}>
              Edit
            </Button>
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
    </Drawer>
  )
}

// ── Main Page ─────────────────────────────────────────────────────

export default function AdminInventoryPage() {
  const showToast = useToast()
  const [items, setItems] = React.useState<InventoryItemRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(0)
  const [pageSize] = React.useState(25)
  const [search, setSearch] = React.useState('')
  const [categoryFilter, setCategoryFilter] = React.useState('')
  const [itemTypeFilter, setItemTypeFilter] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [categories, setCategories] = React.useState<CategoryOption[]>([])
  const [hubs, setHubs] = React.useState<HubOption[]>([])
  const [formItem, setFormItem] = React.useState<InventoryItemRow | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [detailRow, setDetailRow] = React.useState<InventoryItemRow | null>(null)
  const [retireItem, setRetireItem] = React.useState<InventoryItemRow | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize) })
    if (search) params.set('q', search)
    if (categoryFilter) params.set('categoryId', categoryFilter)
    if (itemTypeFilter) params.set('itemType', itemTypeFilter)
    const res = await fetch(`/api/inventory?${params}`).then((r) => r.json()).catch(() => ({ data: [], total: 0 }))
    setItems(res.data ?? [])
    setTotal(res.total ?? 0)
    setLoading(false)
  }, [page, pageSize, search, categoryFilter, itemTypeFilter])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    fetch('/api/inventory/categories').then((r) => r.json()).then((d) => setCategories(d.data ?? [])).catch(() => {})
    fetch('/api/inventory/hubs').then((r) => r.json()).then((d) => setHubs(d.data ?? [])).catch(() => {})
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
        <Typography variant="h5" fontWeight={700}>Inventory</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setFormItem(null); setFormOpen(true) }}>
          Add Item
        </Button>
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
              onClick={() => { setItemTypeFilter(type); setPage(0) }}
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
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(0) }}
            sx={{ width: 200 }}
          >
            <MenuItem value="">All categories</MenuItem>
            {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField>
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
              : items.map((item) => (
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
                          <Chip size="small" label="S" variant="outlined" color="primary" sx={{ fontSize: 10, height: 18 }} />
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
                      <Chip size="small" label={item.unitCounts?.available ?? 0} color="success" variant="outlined" />
                    </TableCell>
                    <TableCell align="center">
                      <Chip size="small" label={item.unitCounts?.checkedOut ?? 0} color={item.unitCounts?.checkedOut > 0 ? 'info' : 'default'} variant="outlined" />
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">{item.unitCounts?.totalUnits ?? item.quantity ?? 0}</Typography>
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => { setFormItem(item); setFormOpen(true) }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Retire">
                          <IconButton size="small" color="error" onClick={() => setRetireItem(item)}>
                            <ArchiveIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
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
      <DetailDrawer
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
