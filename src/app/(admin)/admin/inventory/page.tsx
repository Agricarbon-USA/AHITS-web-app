'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Stack, Alert,
  Chip, IconButton, Tooltip, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Skeleton, Switch, FormControlLabel, Accordion, AccordionSummary,
  AccordionDetails, Drawer, Divider, TablePagination,
  FormControl, FormLabel, RadioGroup, Radio, Link,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import ArchiveIcon from '@mui/icons-material/Archive'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import DownloadIcon from '@mui/icons-material/Download'
import QRCode from 'qrcode'

// ── Helper maps ───────────────────────────────────────────────────

const STATUS_CHIP_COLOR: Record<string, 'success' | 'primary' | 'warning' | 'default' | 'error'> = {
  AVAILABLE: 'success',
  CHECKED_OUT: 'primary',
  IN_MAINTENANCE: 'warning',
  RETIRED: 'default',
}

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Available',
  CHECKED_OUT: 'Checked Out',
  IN_MAINTENANCE: 'In Maintenance',
  RETIRED: 'Retired',
}

// ── Types ─────────────────────────────────────────────────────────

interface CategoryOption {
  id: string
  name: string
}

interface HubOption {
  id: string
  name: string
  city: string
  state: string
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
  status: string
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
}

interface CheckLogEntry {
  id: string
  action: string
  condition: string | null
  submittedAt: string
  operator: { id: string; name: string } | null
}

interface ItemDetail extends InventoryItemRow {
  checkLogs: CheckLogEntry[]
}

interface UserOption {
  id: string
  name: string
  role: string
}

interface ProjectOption {
  id: string
  name: string
}

// ── Confirm Dialog ────────────────────────────────────────────────

function ConfirmDialog({
  open, title, message, confirmLabel, confirmColor, onClose, onConfirm,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  confirmColor?: 'error' | 'warning' | 'primary'
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [loading, setLoading] = React.useState(false)
  const handle = async () => {
    setLoading(true)
    await onConfirm()
    setLoading(false)
  }
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography>{message}</Typography>
      </DialogContent>
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

// ── Item Form Dialog ──────────────────────────────────────────────

function ItemFormDialog({
  item,
  categories,
  hubs,
  onClose,
  onSuccess,
}: {
  item: InventoryItemRow | null
  categories: CategoryOption[]
  hubs: HubOption[]
  onClose: () => void
  onSuccess: (msg: string) => void
}) {
  const isEdit = !!item
  const [name, setName] = React.useState('')
  const [itemType, setItemType] = React.useState('CONSUMABLE')
  const [unitId, setUnitId] = React.useState('')
  const [categoryId, setCategoryId] = React.useState('')
  const [status, setStatus] = React.useState('AVAILABLE')
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
      setName(item.name)
      setItemType(item.itemType)
      setUnitId(item.unitId ?? '')
      setCategoryId(item.category.id)
      setStatus(item.status)
      setHubId(item.hub?.id ?? '')
      setQuantity(item.quantity)
      setExpectedQuantity(item.expectedQuantity != null ? String(item.expectedQuantity) : '')
      setLowStockThreshold(item.lowStockThreshold != null ? String(item.lowStockThreshold) : '')
      setUnitCost(item.unitCost != null ? String(item.unitCost) : '')
      setSupplier(item.supplier ?? '')
      setReorderUrl(item.reorderUrl ?? '')
      setNotes(item.notes ?? '')
    } else {
      setName(''); setItemType('CONSUMABLE'); setUnitId(''); setCategoryId('')
      setStatus('AVAILABLE'); setHubId(''); setQuantity(1)
      setExpectedQuantity(''); setLowStockThreshold('')
      setUnitCost(''); setSupplier(''); setReorderUrl(''); setNotes('')
    }
    setError('')
  }, [item])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const body: Record<string, unknown> = {
        name,
        categoryId,
        itemType,
        quantity,
      }
      if (itemType === 'SERIALIZED' && unitId) body.unitId = unitId
      if (isEdit) body.status = status
      if (hubId) body.hubId = hubId
      if (expectedQuantity !== '') body.expectedQuantity = parseInt(expectedQuantity)
      if (lowStockThreshold !== '') body.lowStockThreshold = parseInt(lowStockThreshold)
      if (unitCost !== '') body.unitCost = parseFloat(unitCost)
      if (supplier) body.supplier = supplier
      if (reorderUrl) body.reorderUrl = reorderUrl
      if (notes) body.notes = notes

      const url = isEdit ? `/api/inventory/${item!.id}` : '/api/inventory'
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = typeof data.error === 'object' ? JSON.stringify(data.error) : (data.error ?? 'Failed to save')
        setError(msg)
        return
      }
      onSuccess(isEdit ? `${name} updated` : `${name} added`)
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
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
              <TextField
                label="Unit / Serial Number"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                fullWidth
                helperText="e.g. GPS-003, DRILL-01 — this will link to a QR sticker"
              />
            )}

            <TextField select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required fullWidth>
              {categories.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </TextField>

            {isEdit && (
              <TextField select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} fullWidth>
                <MenuItem value="AVAILABLE">Available</MenuItem>
                <MenuItem value="IN_MAINTENANCE">In Maintenance</MenuItem>
                <MenuItem value="RETIRED">Retired</MenuItem>
              </TextField>
            )}

            <TextField select label="Hub Location" value={hubId} onChange={(e) => setHubId(e.target.value)} fullWidth>
              <MenuItem value="">Unknown</MenuItem>
              {hubs.map((h) => (
                <MenuItem key={h.id} value={h.id}>{h.city}, {h.state}</MenuItem>
              ))}
            </TextField>

            <TextField
              label="Current Quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
              required fullWidth inputProps={{ min: 0 }}
            />
            <TextField
              label="Expected / Total Quantity"
              type="number"
              value={expectedQuantity}
              onChange={(e) => setExpectedQuantity(e.target.value)}
              fullWidth inputProps={{ min: 0 }}
              helperText="How many of this item should exist in total? Used to spot shrinkage."
            />
            <TextField
              label="Low Stock Alert Threshold"
              type="number"
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(e.target.value)}
              fullWidth inputProps={{ min: 0 }}
              helperText="Show a warning on the dashboard when current quantity falls to or below this number."
            />

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="body2">Purchasing Info</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <TextField
                    label="Unit Cost ($)"
                    type="number"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    fullWidth inputProps={{ min: 0, step: '0.01' }}
                  />
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

function DetailDrawer({
  row,
  onClose,
  onEdit,
  onRetire,
}: {
  row: InventoryItemRow | null
  onClose: () => void
  onEdit: (item: InventoryItemRow) => void
  onRetire: (item: InventoryItemRow) => void
}) {
  const [detail, setDetail] = React.useState<ItemDetail | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!row) { setDetail(null); setQrDataUrl(null); return }
    setLoading(true)
    fetch(`/api/inventory/${row.id}`)
      .then((r) => r.json())
      .then(async (d) => {
        const item: ItemDetail = d.data
        setDetail(item)
        const dataUrl = await QRCode.toDataURL(item.qrCodeId, { width: 160, margin: 1 })
        setQrDataUrl(dataUrl)
      })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [row])

  const downloadQr = () => {
    if (!qrDataUrl || !detail) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `qr-${detail.name.replace(/\s+/g, '-').toLowerCase()}.png`
    a.click()
  }

  return (
    <Drawer anchor="right" open={!!row} onClose={onClose} PaperProps={{ sx: { width: 500 } }}>
      {loading && (
        <Box p={3}>
          <Stack spacing={1.5}>
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={32} />)}
          </Stack>
        </Box>
      )}

      {!loading && detail && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box px={3} pt={3} pb={2}>
            <Typography variant="h6" fontWeight={700}>{detail.name}</Typography>
            <Stack direction="row" spacing={1} mt={1}>
              <Chip size="small" label={detail.itemType === 'SERIALIZED' ? 'Serialized' : 'Consumable'}
                variant="outlined" color={detail.itemType === 'SERIALIZED' ? 'primary' : 'default'} />
              <Chip size="small" label={STATUS_LABELS[detail.status] ?? detail.status}
                color={STATUS_CHIP_COLOR[detail.status] ?? 'default'} />
            </Stack>
          </Box>
          <Divider />

          <Box sx={{ flex: 1, overflow: 'auto', px: 3, py: 2 }}>
            <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5} mb={3}>
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>Category</Typography>
                <Typography variant="body2">{detail.category?.name ?? '—'}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>Hub Location</Typography>
                <Typography variant="body2">
                  {detail.hub ? `${detail.hub.city}, ${detail.hub.state}` : '—'}
                </Typography>
              </Box>
              {detail.itemType === 'SERIALIZED' && (
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>Unit ID</Typography>
                  <Typography variant="body2">{detail.unitId ?? '—'}</Typography>
                </Box>
              )}
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>Quantity</Typography>
                <Typography variant="body2">
                  {detail.expectedQuantity != null ? `${detail.quantity} / ${detail.expectedQuantity}` : String(detail.quantity)}
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

            <Box mb={3}>
              <Typography variant="subtitle2" fontWeight={600} mb={1}>QR Code</Typography>
              {qrDataUrl && (
                <Stack spacing={1} alignItems="flex-start">
                  <Box component="img" src={qrDataUrl} alt="QR code" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0.5 }} />
                  <Button size="small" startIcon={<DownloadIcon />} onClick={downloadQr} variant="outlined">Download QR</Button>
                  <Typography variant="caption" color="text.secondary">QR sticker printing coming soon.</Typography>
                </Stack>
              )}
            </Box>

            {row?.status === 'CHECKED_OUT' && (
              <Box mb={3}>
                <Typography variant="subtitle2" fontWeight={600} mb={1}>Current Status</Typography>
                {row.currentOperator && (
                  <Typography variant="body2">Currently with <strong>{row.currentOperator.name}</strong></Typography>
                )}
                {row.currentProject && (
                  <Typography variant="body2">Checked out to <strong>{row.currentProject.name}</strong></Typography>
                )}
              </Box>
            )}

            <Box>
              <Typography variant="subtitle2" fontWeight={600} mb={1}>Recent Activity</Typography>
              {detail.checkLogs.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No check logs yet.</Typography>
              ) : (
                <Stack spacing={1}>
                  {detail.checkLogs.map((log) => (
                    <Stack key={log.id} direction="row" spacing={1} alignItems="center">
                      <Chip
                        size="small"
                        label={log.action === 'CHECK_OUT' ? 'Out' : 'In'}
                        color={log.action === 'CHECK_OUT' ? 'primary' : 'success'}
                        sx={{ minWidth: 40 }}
                      />
                      <Typography variant="body2">{log.operator?.name ?? 'Unknown'}</Typography>
                      {log.condition && <Chip size="small" label={log.condition.replace(/_/g, ' ')} variant="outlined" />}
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto !important' }}>
                        {new Date(log.submittedAt).toLocaleDateString()}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>
          </Box>

          <Divider />
          <Stack direction="row" spacing={1} px={3} py={2} justifyContent="flex-end">
            <Button onClick={onClose}>Close</Button>
            {detail.status !== 'RETIRED' && (
              <>
                <Button variant="outlined" color="error" startIcon={<ArchiveIcon />}
                  onClick={() => { onClose(); onRetire(detail) }}>
                  Retire
                </Button>
                <Button variant="contained" startIcon={<EditIcon />}
                  onClick={() => { onClose(); onEdit(detail) }}>
                  Edit
                </Button>
              </>
            )}
          </Stack>
        </Box>
      )}
    </Drawer>
  )
}

// ── Main Page ─────────────────────────────────────────────────────

export default function AdminInventoryPage() {
  const [items, setItems] = React.useState<InventoryItemRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [toast, setToast] = React.useState('')
  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)

  const [categories, setCategories] = React.useState<CategoryOption[]>([])
  const [hubs, setHubs] = React.useState<HubOption[]>([])

  const [q, setQ] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')
  const [filterType, setFilterType] = React.useState('')
  const [filterCategory, setFilterCategory] = React.useState('')
  const [filterStatus, setFilterStatus] = React.useState('')
  const [filterHub, setFilterHub] = React.useState('')
  const [filterOperator, setFilterOperator] = React.useState('')
  const [filterProject, setFilterProject] = React.useState('')
  const [showRetired, setShowRetired] = React.useState(false)

  const [operators, setOperators] = React.useState<UserOption[]>([])
  const [projects, setProjects] = React.useState<ProjectOption[]>([])

  const [addOpen, setAddOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<InventoryItemRow | null>(null)
  const [drawerRow, setDrawerRow] = React.useState<InventoryItemRow | null>(null)
  const [retireItem, setRetireItem] = React.useState<InventoryItemRow | null>(null)

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page + 1))
      params.set('pageSize', String(pageSize))
      if (debouncedQ) params.set('q', debouncedQ)
      if (filterType) params.set('itemType', filterType)
      if (filterCategory) params.set('categoryId', filterCategory)
      if (filterStatus) params.set('status', filterStatus)
      if (filterHub) params.set('hubId', filterHub)
      if (filterOperator) params.set('operatorId', filterOperator)
      if (filterProject) params.set('projectId', filterProject)
      if (showRetired) params.set('includeRetired', 'true')
      const res = await fetch(`/api/inventory?${params.toString()}`)
      const data = await res.json()
      setItems(data.data ?? [])
      setTotal(data.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, debouncedQ, filterType, filterCategory, filterStatus, filterHub, filterOperator, filterProject, showRetired])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    Promise.all([
      fetch('/api/categories').then((r) => r.json()),
      fetch('/api/hubs').then((r) => r.json()),
    ]).then(([cats, hs]) => { setCategories(cats); setHubs(hs) }).catch(() => {})

    fetch('/api/users').then((r) => r.json()).then((d) => {
      setOperators((d.data ?? []).filter((u: UserOption) => u.role === 'OPERATOR'))
    }).catch(() => {})

    fetch('/api/projects').then((r) => r.json()).then((d) => {
      setProjects(d.data ?? [])
    }).catch(() => {})
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  const handleRetire = async () => {
    if (!retireItem) return
    await fetch(`/api/inventory/${retireItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RETIRED' }),
    })
    showToast(`${retireItem.name} retired`)
    setRetireItem(null)
    await load()
  }

  const checkedOutCount = items.filter((i) => i.status === 'CHECKED_OUT').length

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5">Inventory</Typography>
          <Typography variant="body2" color="text.secondary">
            {total} item{total !== 1 ? 's' : ''} · {checkedOutCount} checked out
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
          Add Item
        </Button>
      </Stack>

      {toast && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setToast('')}>{toast}</Alert>}

      <Stack direction="row" spacing={1.5} mb={1.5} flexWrap="wrap">
        <TextField
          size="small"
          placeholder="Search by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ minWidth: 200 }}
        />
        <TextField select size="small" label="All Types" value={filterType} onChange={(e) => setFilterType(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="">All Types</MenuItem>
          <MenuItem value="SERIALIZED">Serialized</MenuItem>
          <MenuItem value="CONSUMABLE">Consumable</MenuItem>
        </TextField>
        <TextField select size="small" label="All Categories" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">All Categories</MenuItem>
          {categories.map((c) => (
            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="All Statuses" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">All Statuses</MenuItem>
          <MenuItem value="AVAILABLE">Available</MenuItem>
          <MenuItem value="CHECKED_OUT">Checked Out</MenuItem>
          <MenuItem value="IN_MAINTENANCE">In Maintenance</MenuItem>
          {showRetired && <MenuItem value="RETIRED">Retired</MenuItem>}
        </TextField>
        <TextField select size="small" label="All Hubs" value={filterHub} onChange={(e) => setFilterHub(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="">All Hubs</MenuItem>
          {hubs.map((h) => (
            <MenuItem key={h.id} value={h.id}>{h.city}, {h.state}</MenuItem>
          ))}
        </TextField>
      </Stack>

      <Stack direction="row" spacing={1.5} mb={2.5} alignItems="center" flexWrap="wrap">
        <TextField select size="small" label="All Operators" value={filterOperator} onChange={(e) => setFilterOperator(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">All Operators</MenuItem>
          {operators.map((op) => <MenuItem key={op.id} value={op.id}>{op.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="All Projects" value={filterProject} onChange={(e) => setFilterProject(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">All Projects</MenuItem>
          {projects.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </TextField>
        <Box flexGrow={1} />
        <FormControlLabel
          control={<Switch checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} size="small" />}
          label={<Typography variant="body2">Show retired</Typography>}
        />
      </Stack>

      <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 600, color: 'text.secondary', fontSize: 12 } }}>
              <TableCell>ITEM</TableCell>
              <TableCell>TYPE</TableCell>
              <TableCell>QTY</TableCell>
              <TableCell>STATUS</TableCell>
              <TableCell>LOCATION</TableCell>
              <TableCell>PROJECT</TableCell>
              <TableCell align="right">ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton width={j === 6 ? 64 : 100} /></TableCell>
                    ))}
                  </TableRow>
                ))
              : items.map((item) => {
                  const isLow = item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold
                  const isRetired = item.status === 'RETIRED'
                  return (
                    <TableRow
                      key={item.id}
                      hover
                      sx={{ opacity: isRetired ? 0.5 : 1, cursor: 'pointer', '&:last-child td': { border: 0 } }}
                      onClick={() => setDrawerRow(item)}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{item.name}</Typography>
                        <Stack direction="row" spacing={0.5} mt={0.25} alignItems="center">
                          <Chip size="small" label={item.category?.name} sx={{ height: 18, fontSize: 11 }} />
                          {item.unitId && (
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{item.unitId}</Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={item.itemType === 'SERIALIZED' ? 'Serialized' : 'Consumable'}
                          variant="outlined"
                          color={item.itemType === 'SERIALIZED' ? 'primary' : 'default'}
                        />
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          {isLow && <WarningAmberIcon fontSize="small" color="error" />}
                          <Typography variant="body2" color={isLow ? 'error' : 'inherit'}>
                            {item.expectedQuantity != null ? `${item.quantity} / ${item.expectedQuantity}` : item.quantity}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={STATUS_LABELS[item.status] ?? item.status}
                          color={STATUS_CHIP_COLOR[item.status] ?? 'default'}
                        />
                      </TableCell>
                      <TableCell>
                        {item.status === 'CHECKED_OUT' && item.currentOperator
                          ? <Typography variant="body2" fontStyle="italic">With {item.currentOperator.name}</Typography>
                          : <Typography variant="body2">{item.hub ? `${item.hub.city}, ${item.hub.state}` : '—'}</Typography>
                        }
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{item.currentProject?.name ?? '—'}</Typography>
                      </TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => setEditItem(item)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {!isRetired && (
                            <Tooltip title="Retire">
                              <IconButton size="small" color="error" onClick={() => setRetireItem(item)}>
                                <ArchiveIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )
                })}

            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  No items found. Click &quot;Add Item&quot; to add your first one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value)); setPage(0) }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      </TableContainer>

      {addOpen && (
        <ItemFormDialog
          item={null}
          categories={categories}
          hubs={hubs}
          onClose={() => setAddOpen(false)}
          onSuccess={(msg) => { showToast(msg); load() }}
        />
      )}

      {editItem && (
        <ItemFormDialog
          item={editItem}
          categories={categories}
          hubs={hubs}
          onClose={() => setEditItem(null)}
          onSuccess={(msg) => { showToast(msg); load() }}
        />
      )}

      <DetailDrawer
        row={drawerRow}
        onClose={() => setDrawerRow(null)}
        onEdit={(item) => setEditItem(item)}
        onRetire={(item) => setRetireItem(item)}
      />

      <ConfirmDialog
        open={!!retireItem}
        title={`Retire ${retireItem?.name ?? ''}?`}
        message="This will mark the item as retired and hide it from active inventory. All check-out history is preserved."
        confirmLabel="Retire"
        confirmColor="error"
        onClose={() => setRetireItem(null)}
        onConfirm={handleRetire}
      />
    </Box>
  )
}
