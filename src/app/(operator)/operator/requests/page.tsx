'use client'

import * as React from 'react'
import {
  Box,
  Typography,
  Button,
  Stack,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  IconButton,
  TextField,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/shared/useToast'
import { StatusChip } from '@/components/shared/StatusChip'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RequestRow {
  id: string
  status: string
  requestType: string
  label: string | null
  neededBy: string | null
  createdAt: string
  lineCount: number
  decisionNote: string | null
  projectName: string | null
  fulfillerHubName: string | null
  stockReservedAt: string | null
  fulfillerOperatorId: string | null
}

interface HubOption { id: string; name: string; city: string; state: string }
interface ProjectOption { id: string; name: string }
interface CategoryOption { id: string; name: string }
interface UnitOption { id: string; serialNumber: string | null; position: number }
interface InventoryOption {
  id: string
  name: string
  itemType: string
  category: { id: string; name: string } | null
  availableUnits: UnitOption[]
}
interface VehicleOption { id: string; name: string; type: string }

interface DraftLine {
  key: string
  lineType: 'KIT_ITEM' | 'VEHICLE' | 'NEW_PURCHASE' | 'SHIPPING_LABEL' | 'CONSUMABLE'
  specificInventoryItemId: string
  specificInventoryUnitId: string
  categoryId: string
  requestedQty: number
  specificVehicleId: string
  vehicleType: string
  description: string
  reorderUrl: string
  shipToHubId: string
  shipToAddress: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TERMINAL = new Set(['FULFILLED', 'CANCELLED', 'DENIED'])

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  TRUCK: 'Truck',
  TRAILER: 'Trailer',
  POLARIS_UTV: 'Polaris UTV',
  CAN_AM_UTV: 'Can-Am UTV',
  CHRISTIE_DRILL: 'Christie Drill',
  ATV: 'ATV',
  OTHER: 'Other',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function newKey() {
  return Math.random().toString(36).slice(2)
}

function emptyLine(lineType: DraftLine['lineType']): DraftLine {
  return {
    key: newKey(),
    lineType,
    specificInventoryItemId: '',
    specificInventoryUnitId: '',
    categoryId: '',
    requestedQty: 1,
    specificVehicleId: '',
    vehicleType: '',
    description: '',
    reorderUrl: '',
    shipToHubId: '',
    shipToAddress: '',
  }
}

function isLineValid(line: DraftLine): boolean {
  switch (line.lineType) {
    case 'KIT_ITEM':
    case 'CONSUMABLE':
      return !!(line.specificInventoryItemId || line.categoryId)
    case 'VEHICLE':
      return !!(line.specificVehicleId || line.vehicleType)
    case 'NEW_PURCHASE':
      return !!line.description.trim()
    case 'SHIPPING_LABEL':
      return !!line.description.trim()
  }
}

// ── Line Editor ───────────────────────────────────────────────────────────────

function LineEditor({
  line,
  mode,
  inventory,
  vehicles,
  categories,
  hubs,
  homeHubId,
  onChange,
  onRemove,
}: {
  line: DraftLine
  mode: 'RESERVATION' | 'MATERIAL'
  inventory: InventoryOption[]
  vehicles: VehicleOption[]
  categories: CategoryOption[]
  hubs: HubOption[]
  homeHubId?: string | null
  onChange: (patch: Partial<DraftLine>) => void
  onRemove: () => void
}) {
  const lineTypeOptions: Array<{ value: DraftLine['lineType']; label: string }> =
    mode === 'RESERVATION'
      ? [
          { value: 'KIT_ITEM', label: 'Kit item' },
          { value: 'VEHICLE', label: 'Vehicle' },
        ]
      : [
          { value: 'KIT_ITEM', label: 'Kit item' },
          { value: 'CONSUMABLE', label: 'Consumables' },
          { value: 'NEW_PURCHASE', label: 'New purchase' },
          { value: 'SHIPPING_LABEL', label: 'Shipping label' },
        ]

  const selectedItem = inventory.find((i) => i.id === line.specificInventoryItemId) ?? null
  const isSerialized = selectedItem?.itemType === 'SERIALIZED'

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <TextField
          select
          size="small"
          label="Type"
          value={line.lineType}
          onChange={(e) => {
            const newType = e.target.value as DraftLine['lineType']
            const defaultShipTo = newType === 'SHIPPING_LABEL'
              ? (homeHubId && hubs.some((h) => h.id === homeHubId) ? homeHubId : hubs[0]?.id) ?? ''
              : ''
            onChange({
              lineType: newType,
              specificInventoryItemId: '',
              specificInventoryUnitId: '',
              categoryId: '',
              specificVehicleId: '',
              vehicleType: '',
              description: '',
              reorderUrl: '',
              shipToHubId: defaultShipTo,
              shipToAddress: '',
            })
          }}
          sx={{ minWidth: 140, flexShrink: 0 }}
        >
          {lineTypeOptions.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>

        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          {(line.lineType === 'KIT_ITEM' || line.lineType === 'CONSUMABLE') && (
            <Stack spacing={1}>
              <TextField
                select
                size="small"
                label="Item"
                value={line.specificInventoryItemId}
                onChange={(e) => {
                  const id = e.target.value
                  const item = inventory.find((i) => i.id === id) ?? null
                  onChange({
                    specificInventoryItemId: id,
                    specificInventoryUnitId: '',
                    requestedQty: item?.itemType === 'SERIALIZED' ? 1 : line.requestedQty,
                  })
                }}
                fullWidth
              >
                <MenuItem value="">— Category fallback —</MenuItem>
                {(line.lineType === 'CONSUMABLE'
                  ? inventory.filter((i) => i.itemType === 'CONSUMABLE')
                  : inventory
                ).map((i) => (
                  <MenuItem key={i.id} value={i.id}>
                    {i.name}
                    {i.itemType === 'SERIALIZED' ? ' (serialized)' : ''}
                    {i.category ? ` · ${i.category.name}` : ''}
                  </MenuItem>
                ))}
              </TextField>

              {!line.specificInventoryItemId && (
                <TextField
                  select
                  size="small"
                  label="Category"
                  value={line.categoryId}
                  onChange={(e) => onChange({ categoryId: e.target.value })}
                  fullWidth
                >
                  <MenuItem value="">— None —</MenuItem>
                  {categories.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}

              {line.lineType === 'KIT_ITEM' && isSerialized && (
                <TextField
                  select
                  size="small"
                  label="Specific unit (optional)"
                  value={line.specificInventoryUnitId}
                  onChange={(e) => onChange({ specificInventoryUnitId: e.target.value })}
                  fullWidth
                >
                  <MenuItem value="">Any available unit</MenuItem>
                  {(selectedItem?.availableUnits ?? []).map((u) => (
                    <MenuItem key={u.id} value={u.id}>
                      {u.serialNumber ?? `Unit #${u.position}`}
                    </MenuItem>
                  ))}
                </TextField>
              )}

              {(line.lineType === 'CONSUMABLE' || !isSerialized) && (
                <TextField
                  size="small"
                  type="number"
                  label="Qty"
                  value={line.requestedQty}
                  inputProps={{ min: 1, max: 999 }}
                  onChange={(e) =>
                    onChange({ requestedQty: Math.max(1, parseInt(e.target.value) || 1) })
                  }
                  sx={{ width: 80 }}
                />
              )}
            </Stack>
          )}

          {line.lineType === 'VEHICLE' && (
            <Stack spacing={1}>
              <TextField
                select
                size="small"
                label="Specific vehicle"
                value={line.specificVehicleId}
                onChange={(e) => onChange({ specificVehicleId: e.target.value, vehicleType: '' })}
                fullWidth
              >
                <MenuItem value="">— By type —</MenuItem>
                {vehicles.map((v) => (
                  <MenuItem key={v.id} value={v.id}>
                    {v.name} ({v.type})
                  </MenuItem>
                ))}
              </TextField>

              {!line.specificVehicleId && (
                <TextField
                  select
                  size="small"
                  label="Vehicle type"
                  value={line.vehicleType}
                  onChange={(e) => onChange({ vehicleType: e.target.value })}
                  fullWidth
                >
                  <MenuItem value="">— Any —</MenuItem>
                  {Object.entries(VEHICLE_TYPE_LABELS).map(([k, label]) => (
                    <MenuItem key={k} value={k}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Stack>
          )}

          {line.lineType === 'NEW_PURCHASE' && (
            <Stack spacing={1}>
              <TextField
                size="small"
                label="Description (required)"
                value={line.description}
                onChange={(e) => onChange({ description: e.target.value })}
                placeholder="e.g. Replacement soil probe tips ×10"
                fullWidth
              />
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  type="number"
                  label="Qty"
                  value={line.requestedQty}
                  inputProps={{ min: 1, max: 999 }}
                  onChange={(e) =>
                    onChange({ requestedQty: Math.max(1, parseInt(e.target.value) || 1) })
                  }
                  sx={{ width: 80 }}
                />
                <TextField
                  size="small"
                  label="Purchase link (optional)"
                  value={line.reorderUrl}
                  onChange={(e) => onChange({ reorderUrl: e.target.value })}
                  placeholder="https://…"
                  sx={{ flexGrow: 1 }}
                />
              </Stack>
            </Stack>
          )}

          {line.lineType === 'SHIPPING_LABEL' && (
            <Stack spacing={1}>
              <TextField
                size="small"
                label="Details (required)"
                value={line.description}
                onChange={(e) => onChange({ description: e.target.value })}
                placeholder="e.g. Return broken GPS unit to hub"
                fullWidth
              />
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  type="number"
                  label="Qty"
                  value={line.requestedQty}
                  inputProps={{ min: 1, max: 999 }}
                  onChange={(e) => onChange({ requestedQty: Math.max(1, parseInt(e.target.value) || 1) })}
                  sx={{ width: 80 }}
                />
                <TextField
                  select
                  size="small"
                  label="Ship to hub"
                  value={line.shipToHubId}
                  onChange={(e) => onChange({ shipToHubId: e.target.value, shipToAddress: '' })}
                  sx={{ flex: 1 }}
                >
                  <MenuItem value="">— Other / see address below —</MenuItem>
                  {hubs.map((h) => (
                    <MenuItem key={h.id} value={h.id}>{h.name} · {h.city}, {h.state}</MenuItem>
                  ))}
                </TextField>
              </Stack>
              {!line.shipToHubId && (
                <TextField
                  size="small"
                  label="Ship-to address (if not a hub)"
                  value={line.shipToAddress}
                  onChange={(e) => onChange({ shipToAddress: e.target.value })}
                  placeholder="e.g. 123 Main St, Denver CO 80203"
                  fullWidth
                />
              )}
            </Stack>
          )}
        </Box>

        <IconButton size="small" onClick={onRemove} sx={{ mt: 0.5, flexShrink: 0 }}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  )
}

// ── New Request Dialog ────────────────────────────────────────────────────────

interface NewRequestDialogProps {
  hubs: HubOption[]
  projects: ProjectOption[]
  inventory: InventoryOption[]
  vehicles: VehicleOption[]
  categories: CategoryOption[]
  homeHubId?: string | null
  onClose: () => void
  onSuccess: () => Promise<void>
}

function NewRequestDialog({
  hubs,
  projects,
  inventory,
  vehicles,
  categories,
  homeHubId,
  onClose,
  onSuccess,
}: NewRequestDialogProps) {
  const [mode, setMode] = React.useState<'RESERVATION' | 'MATERIAL'>('RESERVATION')
  const [hubId, setHubId] = React.useState('')
  const [projectId, setProjectId] = React.useState('')
  const [label, setLabel] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [neededBy, setNeededBy] = React.useState('')
  const [lines, setLines] = React.useState<DraftLine[]>([emptyLine('KIT_ITEM')])
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')
  const { mutate, isOffline } = useOfflineQueue()
  const showToast = useToast()

  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key))

  const addLine = (type: DraftLine['lineType']) => {
    const line = emptyLine(type)
    if (type === 'SHIPPING_LABEL') {
      line.shipToHubId = (homeHubId && hubs.some((h) => h.id === homeHubId) ? homeHubId : hubs[0]?.id) ?? ''
    }
    setLines((ls) => [...ls, line])
  }

  const canSubmit =
    !submitting &&
    lines.length > 0 &&
    lines.every(isLineValid) &&
    (mode !== 'RESERVATION' || !!hubId)

  const handleSubmit = async () => {
    setError('')
    setSubmitting(true)
    const body = {
      requestType: mode,
      status: 'REQUESTED' as const,
      label: label.trim() || null,
      notes: notes.trim() || null,
      // Convert "YYYY-MM-DD" from date input to full ISO datetime the API requires.
      neededBy: neededBy ? new Date(neededBy).toISOString() : null,
      projectId: projectId || null,
      fulfillerHubId: mode === 'RESERVATION' ? hubId || null : null,
      lines: lines.map((l) => ({
        lineType: l.lineType === 'CONSUMABLE' ? 'KIT_ITEM' : l.lineType,
        itemType: l.lineType === 'CONSUMABLE' ? 'CONSUMABLE' : null,
        categoryId: l.categoryId || null,
        specificInventoryItemId: l.specificInventoryItemId || null,
        specificInventoryUnitId: l.specificInventoryUnitId || null,
        vehicleType: l.vehicleType || null,
        specificVehicleId: l.specificVehicleId || null,
        description: l.description || null,
        reorderUrl: l.reorderUrl || null,
        requestedQty: l.requestedQty || 1,
        shipToHubId: l.shipToHubId || null,
        shipToAddress: l.shipToAddress || null,
      })),
    }
    const result = await mutate({
      endpoint: '/api/deployment-requests',
      method: 'POST',
      body,
      label: mode === 'RESERVATION' ? 'Reserve rig' : 'Material request',
    })
    setSubmitting(false)
    if (result.ok && result.queued) {
      showToast({ message: 'Request queued — will sync when online.', severity: 'info' })
      onClose()
    } else if (result.ok) {
      showToast({ message: 'Request submitted.', severity: 'success' })
      await onSuccess()
      onClose()
    } else {
      setError(result.error)
    }
  }

  const addLineOptions: Array<{ type: DraftLine['lineType']; label: string }> =
    mode === 'RESERVATION'
      ? [
          { type: 'KIT_ITEM', label: 'Kit item' },
          { type: 'VEHICLE', label: 'Vehicle' },
        ]
      : [
          { type: 'KIT_ITEM', label: 'Kit item' },
          { type: 'CONSUMABLE', label: 'Consumables' },
          { type: 'NEW_PURCHASE', label: 'New purchase' },
          { type: 'SHIPPING_LABEL', label: 'Shipping label' },
        ]

  return (
    <Dialog fullScreen open onClose={onClose}>
      <DialogTitle sx={{ pb: 1 }}>New Request</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={(_evt, val) => {
            if (!val) return
            setMode(val as 'RESERVATION' | 'MATERIAL')
            setLines([emptyLine('KIT_ITEM')])
            setHubId('')
            setProjectId('')
          }}
          size="small"
          sx={{ width: '100%' }}
        >
          <ToggleButton value="RESERVATION" sx={{ flex: 1 }}>
            Reserve a rig
          </ToggleButton>
          <ToggleButton value="MATERIAL" sx={{ flex: 1 }}>
            Request materials
          </ToggleButton>
        </ToggleButtonGroup>

        {error && <Alert severity="error">{error}</Alert>}

        {isOffline && (
          <Alert severity="info">
            You are offline. This request will sync when you reconnect.
          </Alert>
        )}

        {mode === 'RESERVATION' && (
          <Stack spacing={2}>
            <TextField
              select
              required
              label="Hub"
              value={hubId}
              onChange={(e) => setHubId(e.target.value)}
              fullWidth
            >
              <MenuItem value="">— Select a hub —</MenuItem>
              {hubs.map((h) => (
                <MenuItem key={h.id} value={h.id}>
                  {h.name} · {h.city}, {h.state}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type="date"
              label="Needed by"
              value={neededBy}
              onChange={(e) => setNeededBy(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              select
              label="Project (optional)"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              fullWidth
            >
              <MenuItem value="">— None —</MenuItem>
              {projects.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. TX Summer Run"
              fullWidth
            />
          </Stack>
        )}

        {mode === 'MATERIAL' && (
          <Stack spacing={2}>
            <TextField
              type="date"
              label="Needed by"
              value={neededBy}
              onChange={(e) => setNeededBy(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              rows={2}
              placeholder="e.g. Running low on sampling vials at site 4"
              fullWidth
            />
            <TextField
              select
              label="Project (optional)"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              fullWidth
            >
              <MenuItem value="">— None —</MenuItem>
              {projects.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        )}

        <Divider />
        <Typography variant="subtitle2">Line items</Typography>

        {lines.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Add at least one line item below.
          </Typography>
        )}

        <Stack spacing={1}>
          {lines.map((line) => (
            <LineEditor
              key={line.key}
              line={line}
              mode={mode}
              inventory={inventory}
              vehicles={vehicles}
              categories={categories}
              hubs={hubs}
              homeHubId={homeHubId}
              onChange={(patch) => updateLine(line.key, patch)}
              onRemove={() => removeLine(line.key)}
            />
          ))}
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap">
          {addLineOptions.map((o) => (
            <Button
              key={o.type}
              size="small"
              startIcon={<AddIcon />}
              variant="outlined"
              onClick={() => addLine(o.type)}
            >
              {o.label}
            </Button>
          ))}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 2, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {submitting ? 'Submitting…' : 'Submit Request'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RequestsPage() {
  const [requests, setRequests] = React.useState<RequestRow[] | null>(null)
  const [hubs, setHubs] = React.useState<HubOption[]>([])
  const [projects, setProjects] = React.useState<ProjectOption[]>([])
  const [inventory, setInventory] = React.useState<InventoryOption[]>([])
  const [vehicles, setVehicles] = React.useState<VehicleOption[]>([])
  const [categories, setCategories] = React.useState<CategoryOption[]>([])
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [dialogDataLoaded, setDialogDataLoaded] = React.useState(false)
  const [cancellingId, setCancellingId] = React.useState<string | null>(null)
  const [fulfillingId, setFulfillingId] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState<'ACTIVE' | 'CLOSED'>('ACTIVE')
  const showToast = useToast()
  const { mutate } = useOfflineQueue()
  const { user } = useAuth()

  const load = React.useCallback(async () => {
    const res = await fetch('/api/deployment-requests')
    if (res.ok) {
      const json = await res.json()
      setRequests((json.data as RequestRow[]) ?? [])
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const openDialog = async () => {
    setDialogOpen(true)
    if (!dialogDataLoaded) {
      const [hubsRes, projectsRes, inventoryRes, vehiclesRes, categoriesRes] = await Promise.all([
        fetch('/api/hubs'),
        fetch('/api/projects'),
        fetch('/api/inventory?pageSize=200'),
        fetch('/api/vehicles'),
        fetch('/api/categories'),
      ])
      if (hubsRes.ok) setHubs((await hubsRes.json()) as HubOption[])
      if (projectsRes.ok) {
        const d = await projectsRes.json()
        setProjects((d.data as ProjectOption[]) ?? [])
      }
      if (inventoryRes.ok) {
        const d = await inventoryRes.json()
        setInventory((d.data as InventoryOption[]) ?? [])
      }
      if (vehiclesRes.ok) {
        const d = await vehiclesRes.json()
        setVehicles((d.data as VehicleOption[]) ?? [])
      }
      if (categoriesRes.ok) setCategories((await categoriesRes.json()) as CategoryOption[])
      setDialogDataLoaded(true)
    }
  }

  const handleCancel = async (id: string) => {
    setCancellingId(id)
    const result = await mutate({
      endpoint: `/api/deployment-requests/${id}`,
      method: 'PATCH',
      body: { action: 'cancel' },
      label: 'Cancel request',
    })
    setCancellingId(null)
    if (result.ok && result.queued) {
      showToast({ message: 'Cancellation queued — will sync when online.', severity: 'info' })
    } else if (result.ok) {
      showToast({ message: 'Request cancelled.', severity: 'success' })
      await load()
    } else {
      showToast({ message: result.error, severity: 'error' })
    }
  }

  const handleFulfill = async (id: string) => {
    setFulfillingId(id)
    const result = await mutate({
      endpoint: `/api/deployment-requests/${id}`,
      method: 'PATCH',
      body: { action: 'complete' },
      label: 'Mark fulfilled',
    })
    setFulfillingId(null)
    if (result.ok && result.queued) {
      showToast({ message: 'Fulfillment queued — will sync when online.', severity: 'info' })
    } else if (result.ok) {
      showToast({ message: 'Request marked fulfilled.', severity: 'success' })
      await load()
    } else {
      showToast({ message: result.error, severity: 'error' })
    }
  }

  const displayed = (requests ?? []).filter((r) =>
    activeTab === 'ACTIVE' ? !TERMINAL.has(r.status) : TERMINAL.has(r.status),
  )

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">Requests</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => void openDialog()}>
          New Request
        </Button>
      </Stack>

      {requests === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
          <CircularProgress />
        </Box>
      ) : requests.length === 0 ? (
        <Box sx={{ textAlign: 'center', pt: 8 }}>
          <PlaylistAddCheckIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No requests yet
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Reserve a rig from a hub, or request materials from admin.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => void openDialog()}>
            New Request
          </Button>
        </Box>
      ) : (
        <>
          <ToggleButtonGroup
            value={activeTab}
            exclusive
            onChange={(_e, v) => { if (v) setActiveTab(v as 'ACTIVE' | 'CLOSED') }}
            size="small"
            sx={{ mb: 2 }}
          >
            <ToggleButton value="ACTIVE">Active</ToggleButton>
            <ToggleButton value="CLOSED">Closed</ToggleButton>
          </ToggleButtonGroup>
          {displayed.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" pt={4}>
              No {activeTab === 'ACTIVE' ? 'active' : 'closed'} requests.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {displayed.map((req) => (
                <Card key={req.id} variant="outlined">
                  <CardContent sx={{ pb: '12px !important' }}>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="flex-start"
                      spacing={1}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          mb={0.5}
                          flexWrap="wrap"
                        >
                          <StatusChip kind="request" status={req.status} />
                          <Chip
                            size="small"
                            variant="outlined"
                            label={req.requestType === 'RESERVATION' ? 'Reservation' : 'Material'}
                          />
                        </Stack>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {req.label ||
                            (req.requestType === 'RESERVATION'
                              ? 'Rig Reservation'
                              : 'Material Request')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {req.lineCount} line{req.lineCount !== 1 ? 's' : ''}
                          {req.neededBy &&
                            ` · Needed ${new Date(req.neededBy).toLocaleDateString()}`}
                          {req.projectName && ` · ${req.projectName}`}
                        </Typography>
                        {req.decisionNote && (
                          <Typography variant="caption" display="block" color="text.secondary">
                            Admin note: {req.decisionNote}
                          </Typography>
                        )}
                        {req.status === 'STAGED' && req.requestType === 'RESERVATION' && req.stockReservedAt && req.fulfillerHubName && (
                          <Typography variant="caption" display="block" color="success.main">
                            Stock reserved at {req.fulfillerHubName}
                          </Typography>
                        )}
                      </Box>
                      {!TERMINAL.has(req.status) && (
                        req.status === 'FORWARDED' && req.fulfillerOperatorId === user?.userId ? (
                          <Button
                            size="small"
                            color="success"
                            variant="contained"
                            disabled={fulfillingId === req.id}
                            startIcon={
                              fulfillingId === req.id ? (
                                <CircularProgress size={12} color="inherit" />
                              ) : null
                            }
                            onClick={() => void handleFulfill(req.id)}
                            sx={{ flexShrink: 0 }}
                          >
                            Mark Fulfilled
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            disabled={cancellingId === req.id}
                            startIcon={
                              cancellingId === req.id ? (
                                <CircularProgress size={12} color="inherit" />
                              ) : null
                            }
                            onClick={() => void handleCancel(req.id)}
                            sx={{ flexShrink: 0 }}
                          >
                            Cancel
                          </Button>
                        )
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </>
      )}

      {dialogOpen && (
        <NewRequestDialog
          hubs={hubs}
          projects={projects}
          inventory={inventory}
          vehicles={vehicles}
          categories={categories}
          homeHubId={user?.homeHubId}
          onClose={() => setDialogOpen(false)}
          onSuccess={load}
        />
      )}
    </Box>
  )
}
