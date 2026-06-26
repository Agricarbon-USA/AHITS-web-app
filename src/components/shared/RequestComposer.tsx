'use client'

import * as React from 'react'
import {
  Box,
  Typography,
  Button,
  Stack,
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
  CircularProgress,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'

// Shared deployment-request composer. Used by BOTH the operator requests page
// (offline-first: onSubmit routes through the offline queue) and the admin
// requests page (online fetch + optional "for operator" assignment). Extracted
// from the operator page so the two never drift (NEW-3).

// ── Types ───────────────────────────────────────────────────────────────────

export interface HubOption { id: string; name: string; city: string; state: string }
export interface ProjectOption { id: string; name: string }
export interface CategoryOption { id: string; name: string }
export interface UnitOption { id: string; serialNumber: string | null; position: number }
export interface InventoryOption {
  id: string
  name: string
  itemType: string
  category: { id: string; name: string } | null
  availableUnits: UnitOption[]
}
export interface VehicleOption { id: string; name: string; type: string }
export interface OperatorOption { id: string; name: string }

export interface DraftLine {
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

/** Body sent to POST /api/deployment-requests. */
export interface RequestComposerBody {
  requestType: 'RESERVATION' | 'MATERIAL'
  status: 'REQUESTED'
  label: string | null
  notes: string | null
  neededBy: string | null
  projectId: string | null
  fulfillerHubId: string | null
  forOperatorId: string | null
  lines: Array<{
    lineType: string
    itemType: string | null
    categoryId: string | null
    specificInventoryItemId: string | null
    specificInventoryUnitId: string | null
    vehicleType: string | null
    specificVehicleId: string | null
    description: string | null
    reorderUrl: string | null
    requestedQty: number
    shipToHubId: string | null
    shipToAddress: string | null
  }>
}

export interface RequestSubmitResult {
  ok: boolean
  error?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

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

export function emptyLine(lineType: DraftLine['lineType']): DraftLine {
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

// ── Composer ──────────────────────────────────────────────────────────────────

export interface RequestComposerProps {
  hubs: HubOption[]
  projects: ProjectOption[]
  inventory: InventoryOption[]
  vehicles: VehicleOption[]
  categories: CategoryOption[]
  /** Default hub for SHIPPING_LABEL lines (operator's home hub). */
  defaultHubId?: string | null
  /** When provided, shows a "For operator" selector (admin-on-behalf-of). */
  operators?: OperatorOption[]
  /** Operator flow passes its offline state to show the sync banner. */
  offline?: boolean
  /** Submit the built body. Caller owns the transport (offline queue vs fetch),
   *  the success toast, and refreshing the list. Resolves ok/error. */
  onSubmit: (body: RequestComposerBody) => Promise<RequestSubmitResult>
  onClose: () => void
}

export function RequestComposer({
  hubs,
  projects,
  inventory,
  vehicles,
  categories,
  defaultHubId,
  operators,
  offline,
  onSubmit,
  onClose,
}: RequestComposerProps) {
  const [mode, setMode] = React.useState<'RESERVATION' | 'MATERIAL'>('RESERVATION')
  const [hubId, setHubId] = React.useState('')
  const [projectId, setProjectId] = React.useState('')
  const [forOperatorId, setForOperatorId] = React.useState('')
  const [label, setLabel] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [neededBy, setNeededBy] = React.useState('')
  const [lines, setLines] = React.useState<DraftLine[]>([emptyLine('KIT_ITEM')])
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')

  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key))

  const addLine = (type: DraftLine['lineType']) => {
    const line = emptyLine(type)
    if (type === 'SHIPPING_LABEL') {
      line.shipToHubId = (defaultHubId && hubs.some((h) => h.id === defaultHubId) ? defaultHubId : hubs[0]?.id) ?? ''
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
    const body: RequestComposerBody = {
      requestType: mode,
      status: 'REQUESTED',
      label: label.trim() || null,
      notes: notes.trim() || null,
      // Convert "YYYY-MM-DD" from date input to full ISO datetime the API requires.
      neededBy: neededBy ? new Date(neededBy).toISOString() : null,
      projectId: projectId || null,
      fulfillerHubId: mode === 'RESERVATION' ? hubId || null : null,
      forOperatorId: forOperatorId || null,
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
    const result = await onSubmit(body)
    setSubmitting(false)
    if (result.ok) {
      onClose()
    } else {
      setError(result.error ?? 'Failed to submit the request.')
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

        {offline && (
          <Alert severity="info">
            You are offline. This request will sync when you reconnect.
          </Alert>
        )}

        {operators && operators.length > 0 && (
          <TextField
            select
            label="For operator (optional)"
            value={forOperatorId}
            onChange={(e) => setForOperatorId(e.target.value)}
            fullWidth
            helperText="Assign this request to an operator. Leave blank to keep it unassigned."
          >
            <MenuItem value="">— Unassigned —</MenuItem>
            {operators.map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
            ))}
          </TextField>
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
              homeHubId={defaultHubId}
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
