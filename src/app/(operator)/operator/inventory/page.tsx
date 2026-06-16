'use client'

import * as React from 'react'
import {
  Box, Typography, TextField, MenuItem, Stack, Chip,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Skeleton, Drawer, Divider, Button, Link,
} from '@mui/material'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import DownloadIcon from '@mui/icons-material/Download'
import QRCode from 'qrcode'

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

function derivedStatus(unitCounts: { available: number; checkedOut: number; inMaintenance: number; inoperable: number; retired: number }): string {
  if (unitCounts.checkedOut > 0) return 'CHECKED_OUT'
  if (unitCounts.inoperable > 0) return 'INOPERABLE'
  if (unitCounts.inMaintenance > 0) return 'IN_MAINTENANCE'
  if (unitCounts.available > 0) return 'AVAILABLE'
  return 'RETIRED'
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
  quantity: number
  unitCounts: { available: number; checkedOut: number; inMaintenance: number; inoperable: number; retired: number }
  qrCodeId: string
  notes: string | null
  lowStockThreshold: number | null
  itemType: string
  unitId: string | null
  expectedQuantity: number | null
  unitCost: string | null
  supplier: string | null
  reorderUrl: string | null
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

// ── Read-Only Detail Drawer ───────────────────────────────────────

function DetailDrawer({
  row,
  onClose,
}: {
  row: InventoryItemRow | null
  onClose: () => void
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
    <Drawer anchor="right" open={!!row} onClose={onClose} PaperProps={{ sx: { width: 420 } }}>
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
              {(() => {
                const s = derivedStatus(detail.unitCounts)
                return <Chip size="small" label={STATUS_LABELS[s] ?? s} color={STATUS_CHIP_COLOR[s] ?? 'default'} />
              })()}
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
              {detail.supplier && (
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>Supplier</Typography>
                  <Typography variant="body2">{detail.supplier}</Typography>
                </Box>
              )}
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

            {row != null && row.unitCounts.checkedOut > 0 && (
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
          <Stack direction="row" px={3} py={2} justifyContent="flex-end">
            <Button onClick={onClose}>Close</Button>
          </Stack>
        </Box>
      )}
    </Drawer>
  )
}

// ── Main Page ─────────────────────────────────────────────────────

export default function OperatorInventoryPage() {
  const [items, setItems] = React.useState<InventoryItemRow[]>([])
  const [loading, setLoading] = React.useState(true)

  const [categories, setCategories] = React.useState<CategoryOption[]>([])
  const [hubs, setHubs] = React.useState<HubOption[]>([])

  const [q, setQ] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')
  const [filterHub, setFilterHub] = React.useState('')
  const [filterCategory, setFilterCategory] = React.useState('')
  const [filterOperator, setFilterOperator] = React.useState('')

  const [operators, setOperators] = React.useState<UserOption[]>([])

  const [drawerRow, setDrawerRow] = React.useState<InventoryItemRow | null>(null)

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (debouncedQ) params.set('q', debouncedQ)
      if (filterHub) params.set('hubId', filterHub)
      if (filterCategory) params.set('categoryId', filterCategory)
      if (filterOperator) params.set('operatorId', filterOperator)
      const res = await fetch(`/api/inventory?${params.toString()}`)
      const data = await res.json()
      setItems(data.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [debouncedQ, filterHub, filterCategory, filterOperator])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    Promise.all([
      fetch('/api/categories').then((r) => r.json()),
      fetch('/api/hubs').then((r) => r.json()),
    ]).then(([cats, hs]) => { setCategories(cats); setHubs(hs) }).catch(() => {})

    fetch('/api/users').then((r) => r.json()).then((d) => {
      setOperators((d.data ?? []).filter((u: UserOption) => u.role === 'OPERATOR'))
    }).catch(() => {})
    // TODO: Project filter — skip for now, /api/projects route not yet implemented
  }, [])

  const availableCount = items.filter((i) => i.unitCounts.available > 0).length

  return (
    <Box>
      <Box mb={3}>
        <Typography variant="h5">Equipment</Typography>
        <Typography variant="body2" color="text.secondary">
          {availableCount} item{availableCount !== 1 ? 's' : ''} available
        </Typography>
      </Box>

      <Stack direction="row" spacing={1.5} mb={2.5} flexWrap="wrap">
        <TextField
          size="small"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ minWidth: 180 }}
        />
        <TextField select size="small" label="All Hubs" value={filterHub} onChange={(e) => setFilterHub(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="">All Hubs</MenuItem>
          {hubs.map((h) => (
            <MenuItem key={h.id} value={h.id}>{h.city}, {h.state}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="All Categories" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">All Categories</MenuItem>
          {categories.map((c) => (
            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="All Operators" value={filterOperator} onChange={(e) => setFilterOperator(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">All Operators</MenuItem>
          {operators.map((op) => <MenuItem key={op.id} value={op.id}>{op.name}</MenuItem>)}
        </TextField>
        {/* TODO: Rig filter — add after vehicleId added to CheckLog */}
      </Stack>

      <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 600, color: 'text.secondary', fontSize: 12 } }}>
              <TableCell>ITEM</TableCell>
              <TableCell>STATUS</TableCell>
              <TableCell>QTY</TableCell>
              <TableCell>LOCATION / WITH</TableCell>
              <TableCell>PROJECT</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton width={100} /></TableCell>
                    ))}
                  </TableRow>
                ))
              : items.map((item) => {
                  const isLow = item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold
                  return (
                    <TableRow
                      key={item.id}
                      hover
                      sx={{ cursor: 'pointer', '&:last-child td': { border: 0 } }}
                      onClick={() => setDrawerRow(item)}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{item.name}</Typography>
                        <Chip size="small" label={item.category?.name} sx={{ mt: 0.25, height: 18, fontSize: 11 }} />
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const s = derivedStatus(item.unitCounts)
                          return <Chip size="small" label={STATUS_LABELS[s] ?? s} color={STATUS_CHIP_COLOR[s] ?? 'default'} />
                        })()}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          {isLow && <WarningAmberIcon fontSize="small" color="error" />}
                          <Typography variant="body2" color={isLow ? 'error' : 'inherit'}>{item.quantity}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        {item.unitCounts.checkedOut > 0 && item.currentOperator
                          ? <Typography variant="body2" fontStyle="italic">With {item.currentOperator.name}</Typography>
                          : <Typography variant="body2">{item.hub ? `${item.hub.city}, ${item.hub.state}` : '—'}</Typography>
                        }
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{item.currentProject?.name ?? '—'}</Typography>
                      </TableCell>
                    </TableRow>
                  )
                })}

            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  No equipment found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <DetailDrawer row={drawerRow} onClose={() => setDrawerRow(null)} />
    </Box>
  )
}
