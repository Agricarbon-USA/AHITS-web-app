'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Stack, Card, CardContent,
  Chip, CircularProgress, Checkbox, TextField, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, List,
  ListItem, ListItemText, ListItemIcon, ListSubheader, Stepper, Step, StepLabel,
  Alert, Switch, FormControlLabel, Divider, IconButton, Tooltip,
} from '@mui/material'
import { StatusChip } from '@/components/shared/StatusChip'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import AddIcon from '@mui/icons-material/Add'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import StopCircleIcon from '@mui/icons-material/StopCircle'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import GroupIcon from '@mui/icons-material/Group'
import { NotePhotoDialog } from '@/components/shared/NotePhotoDialog'
import { TransferDialog } from '@/components/shared/TransferDialog'
import { DispositionDialog, KitItemSummary } from '@/components/shared/DispositionDialog'
import { QrScannerDialog, type QrResolveResult } from '@/components/shared/QrScannerDialog'
import { DeploymentVehiclesCard, DeploymentKitCard, VEHICLE_ICON } from '@/components/operator/DeploymentCards'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { RentalVehicleForm, RentalVehicleFields, rentalFieldsToVehiclePayload, isRentalFormValid } from '@/components/shared/RentalVehicleForm'
import { useToast } from '@/components/shared/useToast'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { newPlaceholderId } from '@/lib/offline-remap'
import { useAuth } from '@/hooks/useAuth'
import { groupBy, formatDate } from '@/lib/utils'
import { NOTE_PRESETS } from '@/lib/note-presets'
import { stockAvailabilityLabel } from '@/lib/stock-format'
import { VEHICLE_TYPE_ORDER, vehicleTypeLabel } from '@/lib/vehicle-types'

// ── Types ─────────────────────────────────────────────────────────

// VEHICLE_ICON moved to components/operator/DeploymentCards.tsx (CC-12 PR3) and
// re-imported here for the two dialog vehicle pickers that also use it.

interface RigVehicleRow {
  id: string
  vehicle: { id: string; name: string; type: string; isRental: boolean; rentalAgreementUrl?: string | null }
}

interface KitItemRow {
  id: string
  quantity: number
  item: {
    id: string
    name: string
    itemType: string
    lowStockThreshold?: number | null
    categoryRef: { name: string } | null
  }
  inventoryUnit: { id: string; qrCodeId: string; serialNumber: string | null; status: string } | null
}

interface KitRow {
  id: string
  items: KitItemRow[]
}

interface Rig {
  id: string
  label: string | null
  startedAt: string
  operator: { id: string; name: string }
  project: { id: string; name: string } | null
  vehicles: RigVehicleRow[]
  kits: KitRow[]
}

interface VehicleOption {
  id: string
  name: string
  type: string
  assignedOperatorId: string | null
  status: string
}

interface InventoryOption {
  id: string
  name: string
  itemType: string
  quantity: number
  lowStockThreshold: number | null
  // /api/inventory returns category as a {id,name} object (categoryDisplay),
  // matching the scan page and admin deployments builder — not a bare string.
  category: { id: string; name: string } | null
  unitCounts: {
    available: number
    checkedOut: number
    inMaintenance: number
    inoperable: number
    totalUnits: number
  }
  availableQuantity: number
  availableUnits: Array<{ id: string; serialNumber: string | null; qrCodeId: string; position: number }>
  hubStock?: Array<{ hubId: string; hubName: string | null; quantity: number; reservedQty: number; available: number }>
}

interface PendingItemEntry {
  itemType: 'CONSUMABLE' | 'SERIALIZED'
  quantity: number
  inventoryUnitId: string | null
  unitLabel: string | null
}

interface UserOption {
  id: string
  name: string
  role: string
}

interface HubOption {
  id: string
  name: string
  city: string
  state: string
}

interface TransferRow {
  id: string
  note: string
  createdAt: string
  status: string
  fromRig: { id: string; operator: { id: string; name: string } }
  toOperator: { id: string; name: string }
  initiatedBy: { id: string; name: string }
  vehicles: { id: string; vehicle: { id: string; name: string; type: string } }[]
  items: { id: string; quantity: number | null; kitItem: { id: string; quantity: number; item: { id: string; name: string } } }[]
}

interface HandoffRow {
  id: string
  rigId: string
  fromOperatorId: string
  toOperatorId: string
  initiatedById: string
  status: string
  note: string
  responseNote: string | null
  respondedAt: string | null
  createdAt: string
  updatedAt: string
  fromOperatorName: string | null
  toOperatorName: string | null
  initiatedByName: string | null
}

// Returns the available stock count for display and quantity-capping.
// Serialized items use unitCounts.available (unit rows); consumables use
// availableQuantity (= InventoryItem.quantity, the stored consumable count).
const availFor = (i: { itemType: string; unitCounts?: { available?: number } | null; availableQuantity?: number }) =>
  i.itemType === 'SERIALIZED' ? (i.unitCounts?.available ?? 0) : (i.availableQuantity ?? 0)

// Transfer Dialog now lives in components/shared/TransferDialog.tsx (UX-5).
// ── New Deployment Dialog (operator) ──────────────────────────────

// CC-09: pre-fill data from a fulfilled reservation's awaiting-pickup surface.
interface PickupPreset {
  requestId: string
  label: string | null
  hubId: string | null
  lines: Array<{ itemId: string; qty: number }>
}

function NewDeploymentDialog({
  vehicles,
  inventoryItems,
  operators,
  hubs,
  homeHubId,
  pickupPreset,
  onClose,
  onSuccess,
}: {
  vehicles: VehicleOption[]
  inventoryItems: InventoryOption[]
  operators: UserOption[]
  hubs: HubOption[]
  homeHubId?: string | null
  pickupPreset?: PickupPreset | null
  onClose: () => void
  onSuccess: () => void
}) {
  const { mutate } = useOfflineQueue()
  const showToast = useToast()
  const [step, setStep] = React.useState(0)
  const [label, setLabel] = React.useState(() => pickupPreset?.label ?? '')
  const [selVehicles, setSelVehicles] = React.useState<Set<string>>(new Set())
  const [kitItems, setKitItems] = React.useState<Map<string, PendingItemEntry>>(() => {
    if (!pickupPreset?.lines.length) return new Map()
    const m = new Map<string, PendingItemEntry>()
    for (const line of pickupPreset.lines) {
      m.set(line.itemId, { itemType: 'CONSUMABLE', quantity: line.qty, inventoryUnitId: null, unitLabel: null })
    }
    return m
  })
  // CC-25: which item slot the shared QrScannerDialog is scanning (null = closed).
  const [scanTargetId, setScanTargetId] = React.useState<string | null>(null)
  const [note, setNote] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  // CC-09: prefer the pickup hub when picking up a reservation; otherwise fall back to home hub or first hub.
  const [sourceHubId, setSourceHubId] = React.useState(
    () => {
      if (pickupPreset?.hubId && hubs.some((h) => h.id === pickupPreset.hubId)) return pickupPreset.hubId
      return (homeHubId && hubs.some((h) => h.id === homeHubId) ? homeHubId : hubs[0]?.id) ?? ''
    },
  )

  // When hub changes, re-cap consumable quantities that exceed the new hub's available.
  React.useEffect(() => {
    if (!sourceHubId) return
    setKitItems((prev) => {
      let changed = false
      const m = new Map(prev)
      for (const [itemId, entry] of m) {
        if (entry.itemType !== 'CONSUMABLE') continue
        const item = inventoryItems.find((i) => i.id === itemId)
        if (!item) continue
        const hubAvail = item.hubStock?.find((s) => s.hubId === sourceHubId)?.available ?? 0
        if (hubAvail > 0 && entry.quantity > hubAvail) {
          m.set(itemId, { ...entry, quantity: hubAvail })
          changed = true
        }
      }
      return changed ? m : prev
    })
  // inventoryItems is stable (fetched once); sourceHubId is the trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceHubId])

  const unassignedVehicles = vehicles.filter((v) => !v.assignedOperatorId && v.status === 'ACTIVE')
  const availableItems = inventoryItems.filter((i) => availFor(i) > 0)

  const hasUnselectedSerialized = Array.from(kitItems.values()).some(
    (e) => e.itemType === 'SERIALIZED' && !e.inventoryUnitId,
  )

  // CC-25: the shared QrScannerDialog decodes; this resolves the scanned code
  // against the item slot being scanned (scanTargetId). Distinguishes offline
  // (fetch threw) from not-found (server said no) from found-but-wrong-unit.
  const resolveKitUnit = React.useCallback(async (code: string): Promise<QrResolveResult> => {
    const itemId = scanTargetId
    if (!itemId) return { status: 'error', message: 'No item selected.' }
    try {
      const res = await fetch(`/api/inventory/units/by-qr/${encodeURIComponent(code)}`)
      if (!res.ok) return { status: 'not-found' }
      const json = await res.json()
      const unit = json.unit
      if (unit?.inventoryItemId !== itemId) return { status: 'error', message: 'That unit belongs to a different item.' }
      if (unit?.status !== 'AVAILABLE') return { status: 'error', message: 'That unit isn’t available — it’s already checked out.' }
      setKitItems((prev) => {
        const m = new Map(prev)
        m.set(itemId, { itemType: 'SERIALIZED', quantity: 1, inventoryUnitId: unit.id, unitLabel: unit.serialNumber ?? `Unit ${unit.position}` })
        return m
      })
      return { status: 'ok' }
    } catch {
      return { status: 'offline' }
    }
  }, [scanTargetId, setKitItems])

  const hasConsumableInKit = Array.from(kitItems.values()).some((e) => e.itemType === 'CONSUMABLE')

  const launch = async () => {
    // CC-24: the note is optional now (server relaxed too) — no empty-note guard.
    if (hasConsumableInKit && !sourceHubId) { setError('Select a source hub for consumable items.'); return }
    setLoading(true)
    setError('')
    // UR-006: route the create through the durable offline queue so an offline
    // launch is queued (idempotency-keyed, exactly-once) and replays on
    // reconnect instead of being silently lost. The placeholderId lets the queue
    // remap dependent writes made against this rig before it has a real id.
    const result = await mutate({
      endpoint: '/api/deployments',
      method: 'POST',
      label: 'Start deployment',
      placeholderId: newPlaceholderId(),
      body: {
        label: label || undefined,
        note,
        vehicleIds: Array.from(selVehicles),
        kitItems: Array.from(kitItems.entries()).map(([inventoryItemId, entry]) =>
          entry.itemType === 'SERIALIZED'
            ? { itemType: 'SERIALIZED', inventoryItemId, inventoryUnitId: entry.inventoryUnitId! }
            : { inventoryItemId, quantity: entry.quantity }
        ),
        ...(sourceHubId && { sourceHubId }),
        // CC-09: include fromRequestId so the server releases residual holds (acceptance #4)
        ...(pickupPreset?.requestId && { fromRequestId: pickupPreset.requestId }),
      },
    })
    setLoading(false)
    if (result.ok && result.queued) {
      showToast({ message: 'No network — deployment queued, will start when you reconnect.', severity: 'info' })
      onClose()
    } else if (result.ok) {
      onSuccess(); onClose()
    } else if (result.status === 409) {
      // A serialized unit was just taken by someone else — drop serialized picks
      // and send the operator back to reselect.
      const m = new Map(kitItems)
      m.forEach((entry, itemId) => {
        if (entry.itemType === 'SERIALIZED') {
          m.set(itemId, { itemType: 'SERIALIZED', quantity: 1, inventoryUnitId: null, unitLabel: null })
        }
      })
      setKitItems(m)
      setStep(2)
      setError(result.error ?? 'A unit was just taken. Please reselect.')
    } else {
      setError(result.error ?? 'Failed')
    }
  }

  return (
    <>
    <Dialog open={true} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{pickupPreset ? 'Pick Up Reservation' : 'Start Deployment'}</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 3, mt: 1 }}>
          <Step><StepLabel>Details</StepLabel></Step>
          <Step><StepLabel>Build Rig</StepLabel></Step>
          <Step><StepLabel>Build Kit</StepLabel></Step>
          {/* CC-32 (1.1): the retired deployment verb is gone — this step is "Start". */}
          <Step><StepLabel>Start</StepLabel></Step>
        </Stepper>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {step === 0 && (
          <TextField label="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth
            placeholder="e.g. TX Summer Run" autoFocus />
        )}

        {step === 1 && (
          <Box>
            <Typography variant="body2" color="text.secondary" mb={2}>Select your vehicles</Typography>
            {unassignedVehicles.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No available vehicles.</Typography>
            ) : (
              <List dense disablePadding>
                {groupBy(
                  [...unassignedVehicles].sort((a, b) => a.name.localeCompare(b.name)),
                  (v) => v.type,
                  [...VEHICLE_TYPE_ORDER],
                ).map(({ group, items: gv }) => (
                  <React.Fragment key={group}>
                    <ListSubheader sx={{ lineHeight: '32px', bgcolor: 'background.default' }}>
                      {vehicleTypeLabel(group)}
                    </ListSubheader>
                    {gv.map((v) => {
                      const Icon = VEHICLE_ICON[v.type] ?? LocalShippingIcon
                      return (
                        <ListItem key={v.id} disablePadding sx={{ minHeight: 44 }}>
                          <ListItemIcon sx={{ minWidth: 36 }}>
                            <Checkbox size="small" checked={selVehicles.has(v.id)}
                              onChange={(e) => {
                                const s = new Set(selVehicles)
                                e.target.checked ? s.add(v.id) : s.delete(v.id)
                                setSelVehicles(s)
                              }} />
                          </ListItemIcon>
                          <ListItemIcon sx={{ minWidth: 32 }}><Icon fontSize="small" /></ListItemIcon>
                          <ListItemText primary={v.name} />
                        </ListItem>
                      )
                    })}
                  </React.Fragment>
                ))}
              </List>
            )}
          </Box>
        )}

        {step === 2 && (
          <Box>
            <Typography variant="body2" color="text.secondary" mb={2}>Pack your kit</Typography>
            {availableItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No available items.</Typography>
            ) : (
              <Box>
                {groupBy(
                  [...availableItems].sort((a, b) => a.name.localeCompare(b.name)),
                  (item) => item.category?.name ?? 'Uncategorized',
                ).map(({ group, items: gi }) => (
                  <React.Fragment key={group}>
                    <Typography variant="overline" color="text.secondary"
                      sx={{ display: 'block', px: 0.5, mt: 1.5, mb: 0.5, lineHeight: '26px', borderBottom: '1px solid', borderColor: 'divider' }}>
                      {group}
                    </Typography>
                    <Stack spacing={1}>
                      {gi.map((item) => {
                        const isSerialized = item.itemType === 'SERIALIZED'
                        const entry = kitItems.get(item.id)
                        const checked = !!entry
                        // Gate consumable qty on the selected hub's available; fall back to total if no hub.
                        const hubRow = !isSerialized && sourceHubId ? item.hubStock?.find((s) => s.hubId === sourceHubId) : undefined
                        const hubAvail = !isSerialized ? (hubRow?.available ?? (item.availableQuantity ?? 0)) : 0
                        return (
                          <Box key={item.id}>
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <Checkbox size="small" checked={checked}
                                onChange={(e) => {
                                  const m = new Map(kitItems)
                                  if (e.target.checked) {
                                    m.set(item.id, { itemType: isSerialized ? 'SERIALIZED' : 'CONSUMABLE', quantity: 1, inventoryUnitId: null, unitLabel: null })
                                  } else {
                                    m.delete(item.id)
                                  }
                                  setKitItems(m)
                                }} />
                              <Box flexGrow={1}>
                                <Typography variant="body2">{item.name}</Typography>
                              </Box>
                              {checked && !isSerialized && (
                                <TextField
                                  type="number"
                                  size="small"
                                  value={entry?.quantity ?? 1}
                                  onChange={(e) => {
                                    const m = new Map(kitItems)
                                    const v = Math.min(parseInt(e.target.value) || 1, hubAvail)
                                    m.set(item.id, { itemType: 'CONSUMABLE', quantity: v, inventoryUnitId: null, unitLabel: null })
                                    setKitItems(m)
                                  }}
                                  inputProps={{ min: 1, max: hubAvail, style: { MozAppearance: 'textfield', width: 60 } }}
                                  helperText={stockAvailabilityLabel(hubRow, hubAvail)}
                                  sx={{ width: 80, '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': { display: 'none' } }}
                                />
                              )}
                            </Stack>
                            {checked && isSerialized && (
                              <Box pl={5} mt={0.5}>
                                {entry?.inventoryUnitId ? (
                                  <Alert severity="success" sx={{ py: 0.25 }} onClose={() => {
                                    const m = new Map(kitItems)
                                    m.set(item.id, { itemType: 'SERIALIZED', quantity: 1, inventoryUnitId: null, unitLabel: null })
                                    setKitItems(m)
                                  }}>
                                    Unit: {entry.unitLabel ?? entry.inventoryUnitId.slice(0, 8)}
                                  </Alert>
                                ) : (
                                  <Stack spacing={1}>
                                    {/* CC-25: live scanner (with manual entry inside the dialog). */}
                                    <Button size="small" variant="outlined" startIcon={<QrCodeScannerIcon />}
                                      onClick={() => setScanTargetId(item.id)} sx={{ alignSelf: 'flex-start' }}>
                                      Scan QR
                                    </Button>
                                    <TextField select size="small" label="Pick from list"
                                      value=""
                                      onChange={(e) => {
                                        const u = item.availableUnits?.find((u) => u.id === e.target.value)
                                        if (!u) return
                                        const m = new Map(kitItems)
                                        m.set(item.id, { itemType: 'SERIALIZED', quantity: 1, inventoryUnitId: u.id, unitLabel: u.serialNumber ?? `Unit ${u.position}` })
                                        setKitItems(m)
                                      }}>
                                      <MenuItem value="" disabled>Select a unit…</MenuItem>
                                      {(item.availableUnits ?? []).map((u) => (
                                        <MenuItem key={u.id} value={u.id}>
                                          {u.serialNumber ?? `Unit ${u.position}`}
                                        </MenuItem>
                                      ))}
                                    </TextField>
                                  </Stack>
                                )}
                              </Box>
                            )}
                          </Box>
                        )
                      })}
                    </Stack>
                  </React.Fragment>
                ))}
              </Box>
            )}
            {hasConsumableInKit && (
              hubs.length === 0 ? (
                <Alert severity="error" sx={{ mt: 2 }}>
                  No active hubs configured — consumable checkout is unavailable. Contact an admin to set up a hub.
                </Alert>
              ) : (
                <TextField
                  select
                  label="Source hub (required for consumables)"
                  value={sourceHubId}
                  onChange={(e) => setSourceHubId(e.target.value)}
                  fullWidth
                  size="small"
                  sx={{ mt: 2 }}
                >
                  <MenuItem value="" disabled>Select a hub…</MenuItem>
                  {hubs.map((h) => (
                    <MenuItem key={h.id} value={h.id}>{h.name} — {h.city}, {h.state}</MenuItem>
                  ))}
                </TextField>
              )
            )}
            {kitItems.size === 0 && (
              <Alert severity="warning" sx={{ mt: 1 }}>Starting with empty kit</Alert>
            )}
            {/* UR-006: surface exactly what blocks the start HERE (on the kit step),
                so the operator isn't left staring at a greyed-out Start Deployment
                button on the next step with no explanation. */}
            {(hasUnselectedSerialized || (hasConsumableInKit && !sourceHubId)) && (
              <Alert severity="info" sx={{ mt: 2 }}>
                Before you can start:
                {hasUnselectedSerialized && <div>• Pick a unit for each selected serialized item above.</div>}
                {hasConsumableInKit && !sourceHubId && <div>• Choose a source hub for the consumable items.</div>}
              </Alert>
            )}
          </Box>
        )}

        {step === 3 && (
          <Box>
            {/* CC-24: the note is optional now — one-tap presets fill it, free text
                stays available, and launch no longer requires it. */}
            <Stack direction="row" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
              {NOTE_PRESETS.map((p) => (
                <Chip key={p} label={p} size="small" variant="outlined" onClick={() => setNote(p)} />
              ))}
            </Stack>
            <TextField
              label="Deployment note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              multiline rows={3}
              fullWidth
              placeholder="e.g. Heading out for TX soil sampling run"
              autoFocus
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        {step > 0 && <Button onClick={() => setStep((s) => s - 1)} disabled={loading}>Back</Button>}
        {step < 3 ? (
          // UR-006: block leaving the kit step until serialized units are picked
          // and a source hub is chosen — so the user can never reach the note step
          // (and Start Deployment) in a state that leaves it silently disabled.
          <Button variant="contained" onClick={() => setStep((s) => s + 1)}
            disabled={loading || (step === 2 && (hasUnselectedSerialized || (hasConsumableInKit && !sourceHubId)))}>
            Next
          </Button>
        ) : (
          <Button variant="contained" onClick={launch} disabled={loading || hasUnselectedSerialized || (hasConsumableInKit && !sourceHubId)}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}>
            {/* CC-32 (1.1): ONE verb for creating a deployment — "Start Deployment".
                The pickup branch keeps "Pick Up", the one taking-verb. D11
                vocabulary, confirmed by Max 2026-07-28. */}
            {loading ? 'Starting…' : pickupPreset ? 'Pick Up' : 'Start Deployment'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
    <QrScannerDialog
      open={scanTargetId !== null}
      onClose={() => setScanTargetId(null)}
      title="Scan unit QR"
      prompt="Scan the serial unit's QR label for this item."
      onResolve={resolveKitUnit}
    />
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────

export default function MyRigPage() {
  const [rig, setRig] = React.useState<Rig | null | undefined>(undefined)
  const [vehicles, setVehicles] = React.useState<VehicleOption[]>([])
  const [inventoryItems, setInventoryItems] = React.useState<InventoryOption[]>([])
  const [operators, setOperators] = React.useState<UserOption[]>([])
  const [hubs, setHubs] = React.useState<HubOption[]>([])

  const showToast = useToast()
  const { mutate, pendingDeployCreate, refresh: refreshQueue } = useOfflineQueue()
  const { user } = useAuth()
  const [newOpen, setNewOpen] = React.useState(false)
  // CC-09: pickup preset — set when navigated from an AwaitingPickupCard
  const [pickupPreset, setPickupPreset] = React.useState<PickupPreset | null>(null)
  const [transferOpen, setTransferOpen] = React.useState(false)

  // Transfers
  const [incomingTransfers, setIncomingTransfers] = React.useState<TransferRow[]>([])
  const [outgoingTransfers, setOutgoingTransfers] = React.useState<TransferRow[]>([])
  const [respondDialog, setRespondDialog] = React.useState<{ transfer: TransferRow; action: 'accept' | 'decline' } | null>(null)
  const [responseNote, setResponseNote] = React.useState('')
  const [respondLoading, setRespondLoading] = React.useState(false)
  const [cancelTransferId, setCancelTransferId] = React.useState<string | null>(null)
  const [cancelLoading, setCancelLoading] = React.useState(false)

  // Handoffs
  const [incomingHandoffs, setIncomingHandoffs] = React.useState<HandoffRow[]>([])
  const [outgoingHandoffs, setOutgoingHandoffs] = React.useState<HandoffRow[]>([])
  const [handoffRespondDialog, setHandoffRespondDialog] = React.useState<{ handoff: HandoffRow; action: 'accept' | 'decline' } | null>(null)
  const [handoffResponseNote, setHandoffResponseNote] = React.useState('')
  const [handoffRespondLoading, setHandoffRespondLoading] = React.useState(false)
  const [cancelHandoffId, setCancelHandoffId] = React.useState<string | null>(null)
  const [cancelHandoffLoading, setCancelHandoffLoading] = React.useState(false)
  const [handoffOpen, setHandoffOpen] = React.useState(false)
  const [handoffTargetId, setHandoffTargetId] = React.useState('')
  const [handoffNote, setHandoffNote] = React.useState('')
  const [handoffLoading, setHandoffLoading] = React.useState(false)

  // Vehicle remove
  const [removingVehicles, setRemovingVehicles] = React.useState(false)
  const [selVehicles, setSelVehicles] = React.useState<Set<string>>(new Set())

  // Kit remove (bulk — DispositionDialog flow)
  const [removingItems, setRemovingItems] = React.useState(false)
  const [selItems, setSelItems] = React.useState<Set<string>>(new Set())

  // CC-24: single-item kit remove now routes through the SAME DispositionDialog
  // as the bulk path (was a separate "Return Item" dialog that diverged from it).
  // Setting this opens the disposition dialog pre-filtered to one item — 2 taps
  // (tap ⊖ → confirm), with the return condition expressed via the dialog's
  // HUB / INOPERABLE dispositions. Consumable "Log Usage" (below) stays separate:
  // it's field depletion (consumed, no stock restored), not gear removal.
  const [singleRemoveItem, setSingleRemoveItem] = React.useState<KitItemRow | null>(null)

  // Log Usage (consumable daily depletion)
  const [logUsageDialog, setLogUsageDialog] = React.useState<{ open: boolean; kitItem: KitItemRow | null }>({ open: false, kitItem: null })
  const [logUsageQty, setLogUsageQty] = React.useState(1)
  const [logUsageLoading, setLogUsageLoading] = React.useState(false)

  // Add pickers
  const [addVehicleOpen, setAddVehicleOpen] = React.useState(false)
  const [pendingVehicles, setPendingVehicles] = React.useState<Set<string>>(new Set())
  const [isRentalToggle, setIsRentalToggle] = React.useState(false)
  const [rentalFields, setRentalFields] = React.useState<Partial<RentalVehicleFields>>({})
  const [rentalSubmitLoading, setRentalSubmitLoading] = React.useState(false)
  const rentalSubmitRef = React.useRef(false) // Q1: synchronous re-entry guard (the loading state disables the button a tick late)
  const [rentalError, setRentalError] = React.useState('')
  const [addItemOpen, setAddItemOpen] = React.useState(false)
  const [pendingItems, setPendingItems] = React.useState<Map<string, PendingItemEntry>>(new Map())
  const [addItemSourceHubId, setAddItemSourceHubId] = React.useState('')
  // CC-25: which add-items slot the shared QrScannerDialog is scanning (null = closed).
  const [pendingScanId, setPendingScanId] = React.useState<string | null>(null)

  // CC-25: resolve a scanned code against the add-items slot being scanned.
  const resolvePendingUnit = React.useCallback(async (code: string): Promise<QrResolveResult> => {
    const itemId = pendingScanId
    if (!itemId) return { status: 'error', message: 'No item selected.' }
    try {
      const res = await fetch(`/api/inventory/units/by-qr/${encodeURIComponent(code)}`)
      if (!res.ok) return { status: 'not-found' }
      const json = await res.json()
      const unit = json.unit
      if (unit?.inventoryItemId !== itemId) return { status: 'error', message: 'That unit belongs to a different item.' }
      if (unit?.status !== 'AVAILABLE') return { status: 'error', message: 'That unit isn’t available — it’s already checked out.' }
      setPendingItems((prev) => {
        const m = new Map(prev)
        m.set(itemId, { itemType: 'SERIALIZED', quantity: 1, inventoryUnitId: unit.id, unitLabel: unit.serialNumber ?? `Unit ${unit.position}` })
        return m
      })
      return { status: 'ok' }
    } catch {
      return { status: 'offline' }
    }
  }, [pendingScanId])

  type NoteAction = 'addVehicles' | 'removeVehicles' | 'addItems' | 'removeItems' | 'end'
  const [noteDialog, setNoteDialog] = React.useState<NoteAction | null>(null)
  const [actionLoading, setActionLoading] = React.useState(false)


  const loadTransfers = React.useCallback(async () => {
    const [inRes, outRes, inHRes, outHRes] = await Promise.all([
      fetch('/api/transfers?status=PENDING&direction=incoming'),
      fetch('/api/transfers?status=PENDING&direction=outgoing'),
      fetch('/api/handoffs?status=PENDING&direction=incoming'),
      fetch('/api/handoffs?status=PENDING&direction=outgoing'),
    ])
    if (inRes.ok) setIncomingTransfers(await inRes.json())
    if (outRes.ok) setOutgoingTransfers(await outRes.json())
    if (inHRes.ok) setIncomingHandoffs(await inHRes.json())
    if (outHRes.ok) setOutgoingHandoffs(await outHRes.json())
  }, [])

  const load = React.useCallback(async () => {
    const res = await fetch('/api/deployments?active=true')
    if (res.ok) {
      const data: Rig[] = await res.json()
      setRig(data[0] ?? null)
    }
    await loadTransfers()
  }, [loadTransfers])

  // FND-14a: when a queued offline deployment-create drains on reconnect,
  // pendingDeployCreate flips true→false. Without a re-load the page keeps showing
  // the "Start Deployment" empty state against a rig that now exists, so tapping
  // Start 409s. Re-load on that transition so the real active rig appears.
  const prevPendingDeployRef = React.useRef(pendingDeployCreate)
  React.useEffect(() => {
    if (prevPendingDeployRef.current && !pendingDeployCreate) {
      void load()
    }
    prevPendingDeployRef.current = pendingDeployCreate
  }, [pendingDeployCreate, load])

  React.useEffect(() => {
    load()
    fetch('/api/vehicles').then((r) => r.json()).then((d) => setVehicles(d.data ?? d ?? [])).catch(() => {})
    fetch('/api/inventory?pageSize=200').then((r) => r.json()).then((d) => setInventoryItems(d.data ?? [])).catch(() => {})
    // Operator-readable roster (the full /api/users is admin-only → 403 for
    // operators, which left the transfer destination dropdown empty).
    fetch('/api/operators').then((r) => r.json()).then((d) => {
      setOperators(d.data ?? [])
    }).catch(() => {})
    fetch('/api/hubs').then((r) => r.json()).then((d) => setHubs(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {})
  }, [load])

  // CC-09: when navigated from an AwaitingPickupCard (/operator/my-deployment?fromRequestId=xxx),
  // fetch the pickup data and auto-open the dialog pre-seeded. window.location.search is used
  // (not useSearchParams) to avoid the Suspense requirement on this large client component.
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const fromRequestId = params.get('fromRequestId')
    if (!fromRequestId) return
    fetch('/api/deployment-requests/awaiting-pickup')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const req = (d?.data ?? []).find((r: { id: string }) => r.id === fromRequestId)
        if (!req) return
        setPickupPreset({
          requestId: req.id,
          label: req.label ?? null,
          hubId: req.hubId ?? null,
          lines: (req.lines ?? []).map((l: { heldItemId: string; remainingQty: number }) => ({
            itemId: l.heldItemId,
            qty: l.remainingQty,
          })),
        })
        setNewOpen(true)
      })
      .catch(() => {})
  // Run once on mount — URL params don't change during the page lifecycle.
  }, [])

  const handleRespond = async () => {
    if (!respondDialog) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      showToast({ message: 'Responding to a transfer needs an internet connection. Try again once you’re back online.', severity: 'warning' })
      return
    }
    setRespondLoading(true)
    const { transfer, action } = respondDialog
    try {
      const res = await fetch(`/api/transfers/${transfer.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseNote: responseNote || undefined }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : `Could not ${action} the transfer.`, severity: 'error' })
        return
      }
      showToast({ message: action === 'accept' ? 'Transfer accepted.' : 'Transfer declined.', severity: 'success' })
      setRespondDialog(null)
      setResponseNote('')
      await load()
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    } finally {
      setRespondLoading(false)
    }
  }

  const handleCancelTransfer = async () => {
    if (!cancelTransferId) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      showToast({ message: 'Cancelling a transfer needs an internet connection. Try again once you’re back online.', severity: 'warning' })
      return
    }
    setCancelLoading(true)
    try {
      const res = await fetch(`/api/transfers/${cancelTransferId}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Could not cancel the transfer.', severity: 'error' })
        return
      }
      showToast({ message: 'Transfer cancelled.', severity: 'success' })
      setCancelTransferId(null)
      await loadTransfers()
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    } finally {
      setCancelLoading(false)
    }
  }

  const handleHandoffRespond = async () => {
    if (!handoffRespondDialog) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      showToast({ message: "Responding to a handoff needs an internet connection. Try again once you're back online.", severity: 'warning' })
      return
    }
    setHandoffRespondLoading(true)
    const { handoff, action } = handoffRespondDialog
    try {
      const res = await fetch(`/api/handoffs/${handoff.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseNote: handoffResponseNote || undefined }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : `Could not ${action} the handoff.`, severity: 'error' })
        return
      }
      showToast({ message: action === 'accept' ? 'Handoff accepted. You are now the primary operator.' : 'Handoff declined.', severity: 'success' })
      setHandoffRespondDialog(null)
      setHandoffResponseNote('')
      await load()
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    } finally {
      setHandoffRespondLoading(false)
    }
  }

  const handleHandoffCancel = async () => {
    if (!cancelHandoffId) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      showToast({ message: "Cancelling a handoff needs an internet connection. Try again once you're back online.", severity: 'warning' })
      return
    }
    setCancelHandoffLoading(true)
    try {
      const res = await fetch(`/api/handoffs/${cancelHandoffId}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Could not cancel the handoff.', severity: 'error' })
        return
      }
      showToast({ message: 'Handoff cancelled.', severity: 'success' })
      setCancelHandoffId(null)
      await loadTransfers()
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    } finally {
      setCancelHandoffLoading(false)
    }
  }

  const handleHandoffInitiate = async () => {
    if (!rig || !handoffTargetId || !handoffNote.trim()) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      showToast({ message: 'Initiating a handoff needs an internet connection.', severity: 'warning' })
      return
    }
    setHandoffLoading(true)
    try {
      const res = await fetch(`/api/deployments/${rig.id}/handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toOperatorId: handoffTargetId, note: handoffNote }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Could not initiate handoff.', severity: 'error' })
        return
      }
      showToast({ message: 'Handoff request sent.', severity: 'success' })
      setHandoffOpen(false)
      setHandoffTargetId('')
      setHandoffNote('')
      await loadTransfers()
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    } finally {
      setHandoffLoading(false)
    }
  }

  // CC-12 PR3: stable callbacks so the memoized Vehicles/Kit cards don't re-render
  // when unrelated container state changes (e.g. a dialog opens). The card hands
  // back a structural row; look up the full kit item by id for the dialogs.
  const onAddVehicles = React.useCallback(() => setAddVehicleOpen(true), [])
  const onRemoveVehiclesSelected = React.useCallback(() => setNoteDialog('removeVehicles'), [])
  const onAddItems = React.useCallback(() => {
    setAddItemOpen(true)
    if (!addItemSourceHubId) {
      setAddItemSourceHubId((user?.homeHubId && hubs.some((h) => h.id === user.homeHubId) ? user.homeHubId : hubs[0]?.id) ?? '')
    }
  }, [addItemSourceHubId, user, hubs])
  const onRemoveItemsSelected = React.useCallback(() => setNoteDialog('removeItems'), [])

  const handleLogUsage = async () => {
    if (!logUsageDialog.kitItem || !rig) return
    setLogUsageLoading(true)
    const result = await mutate({
      endpoint: `/api/deployments/${rig.id}/items/${logUsageDialog.kitItem.id}`,
      method: 'DELETE',
      body: {
        quantity: logUsageQty,
        returnCondition: 'GOOD',
        consumed: true, // used in the field, not returned — do not restore stock
        notes: `Daily usage log — ${logUsageQty} used`,
      },
      label: 'Log usage',
    })
    if (result.ok && result.queued) {
      showToast({ message: 'Usage queued — will sync when online.', severity: 'info' })
      setLogUsageDialog({ open: false, kitItem: null })
    } else if (result.ok) {
      showToast({ message: 'Usage logged.', severity: 'success' })
      setLogUsageDialog({ open: false, kitItem: null })
      await load()
    } else {
      showToast({ message: result.error || 'Could not log usage.', severity: 'error' })
    }
    setLogUsageLoading(false)
  }

  // CC-12 PR3: memoize the derived kit rows. A fresh array each render would give
  // the callbacks below unstable deps AND hand the memoized kit card a new `kitItems`
  // prop every render — defeating the memo boundary in production. Keyed on `rig`.
  const kitItems = React.useMemo(() => rig?.kits.flatMap((k) => k.items) ?? [], [rig])
  // CC-12 PR3: kit-row callbacks (defined after kitItems). The memoized kit card
  // hands back a structural row; look up the full kit item by id for the dialogs.
  const onLogUsage = React.useCallback((ki: { id: string }) => {
    const full = kitItems.find((k) => k.id === ki.id)
    if (full) { setLogUsageDialog({ open: true, kitItem: full }); setLogUsageQty(1) }
  }, [kitItems])
  const onReturnItem = React.useCallback((ki: { id: string }) => {
    const full = kitItems.find((k) => k.id === ki.id)
    if (full) setSingleRemoveItem(full)
  }, [kitItems])
  const unassignedVehicles = vehicles.filter((v) => !v.assignedOperatorId && v.status === 'ACTIVE')

  const doAction = async (action: NoteAction, note: string, photoUrls: string[]) => {
    if (!rig) return
    setActionLoading(true)
    let result: Awaited<ReturnType<typeof mutate>> | null = null
    switch (action) {
      case 'addVehicles':
        result = await mutate({
          endpoint: `/api/deployments/${rig.id}/vehicles`,
          method: 'POST',
          body: { vehicleIds: Array.from(pendingVehicles), note, photoUrls },
          label: 'Add vehicles',
        })
        setPendingVehicles(new Set())
        setAddVehicleOpen(false)
        break
      case 'removeVehicles':
        result = await mutate({
          endpoint: `/api/deployments/${rig.id}/vehicles`,
          method: 'DELETE',
          body: {
            vehicles: Array.from(selVehicles).map((vehicleId) => ({
              vehicleId,
              dispositionType: 'AVAILABLE',
            })),
            note,
          },
          label: 'Remove vehicles',
        })
        setSelVehicles(new Set())
        setRemovingVehicles(false)
        break
      case 'addItems': {
        result = await mutate({
          endpoint: `/api/deployments/${rig.id}/items`,
          method: 'POST',
          body: {
            items: Array.from(pendingItems.entries()).map(([inventoryItemId, entry]) =>
              entry.itemType === 'SERIALIZED'
                ? { itemType: 'SERIALIZED', inventoryItemId, inventoryUnitId: entry.inventoryUnitId! }
                : { itemType: 'CONSUMABLE', inventoryItemId, quantity: entry.quantity }
            ),
            note,
            photoUrls,
            ...(addItemSourceHubId && { sourceHubId: addItemSourceHubId }),
          },
          label: 'Add items',
        })
        // Online conflict: a unit was taken between selection and submit — reselect.
        if (!result.ok && result.status === 409) {
          const m = new Map(pendingItems)
          m.forEach((entry, itemId) => {
            if (entry.itemType === 'SERIALIZED') {
              m.set(itemId, { itemType: 'SERIALIZED', quantity: 1, inventoryUnitId: null, unitLabel: null })
            }
          })
          setPendingItems(m)
          await load()
          setActionLoading(false)
          setNoteDialog(null)
          setAddItemOpen(true)
          showToast({ message: result.error ?? 'A unit was just taken. Please reselect.', severity: 'warning' })
          return
        }
        setPendingItems(new Map())
        setAddItemOpen(false)
        break
      }
      case 'end':
        result = await mutate({
          endpoint: `/api/deployments/${rig.id}/end`,
          method: 'POST',
          body: { note },
          label: 'End deployment',
        })
        break
    }
    setActionLoading(false)
    setNoteDialog(null)
    if (result && result.ok && result.queued) {
      showToast({ message: 'Saved offline — will sync when you reconnect.', severity: 'info' })
    } else if (result && !result.ok) {
      showToast({ message: result.error || 'Action failed.', severity: 'error' })
    }
    await load()
  }

  if (rig === undefined) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress /></Box>
  }

  if (!rig) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 10 }}>
        {incomingHandoffs.map((h) => (
          <Alert
            key={h.id}
            severity="info"
            sx={{ mb: 1.5, width: '100%' }}
          >
            <Typography variant="body2" fontWeight={600}>
              Deployment Handoff from {h.fromOperatorName}
            </Typography>
            <Typography variant="caption" color="text.secondary">&ldquo;{h.note}&rdquo;</Typography>
            {/* CC-23: actions in the body (was the Alert `action` slot pulled up
                with mt:-0.5, which cramped two buttons beside two text lines at 390px). */}
            <Stack direction="row" spacing={1} sx={{ mt: 1, '& .MuiButton-root': { minHeight: 44, fontSize: 16 } }}>
              <Button size="small" color="error" variant="outlined"
                onClick={() => { setHandoffRespondDialog({ handoff: h, action: 'decline' }); setHandoffResponseNote('') }}>
                Decline
              </Button>
              <Button size="small" color="success" variant="contained"
                onClick={() => { setHandoffRespondDialog({ handoff: h, action: 'accept' }); setHandoffResponseNote('') }}>
                Accept
              </Button>
            </Stack>
          </Alert>
        ))}
        {/* Incoming transfer banners — also shown with no active deployment (B3): a
            transferred-to operator must be able to review/accept a transfer even
            before starting a rig. Accepting auto-creates a destination deployment
            server-side (transfers/[id]/accept), so this is not a dead end. */}
        {incomingTransfers.map((tr) => {
          const vehicleNames = tr.vehicles.map((tv) => tv.vehicle.name).join(', ')
          const itemNames = tr.items.map((ti) => `${ti.kitItem.item.name} ×${ti.quantity ?? ti.kitItem.quantity}`).join(', ')
          const summary = [vehicleNames, itemNames].filter(Boolean).join(', ')
          return (
            <Alert
              key={tr.id}
              severity="info"
              sx={{ mb: 1.5, width: '100%' }}
            >
              <Typography variant="body2" fontWeight={600}>
                Incoming Transfer from {tr.fromRig.operator.name}
              </Typography>
              <Typography variant="body2">{summary}</Typography>
              <Typography variant="caption" color="text.secondary">
                &ldquo;{tr.note}&rdquo; · Accepting starts a new deployment for you.
              </Typography>
              {/* CC-23: actions in the body (was the Alert `action` slot + mt:-0.5). */}
              <Stack direction="row" spacing={1} sx={{ mt: 1, '& .MuiButton-root': { minHeight: 44, fontSize: 16 } }}>
                <Button size="small" color="error" variant="outlined"
                  onClick={() => { setRespondDialog({ transfer: tr, action: 'decline' }); setResponseNote('') }}>
                  Decline
                </Button>
                <Button size="small" color="success" variant="contained"
                  onClick={() => { setRespondDialog({ transfer: tr, action: 'accept' }); setResponseNote('') }}>
                  Accept
                </Button>
              </Stack>
            </Alert>
          )
        })}
        <LocalShippingIcon sx={{ fontSize: 72, color: pendingDeployCreate ? 'warning.main' : 'text.disabled', mb: 2 }} />
        {pendingDeployCreate ? (
          <>
            <Typography variant="h6" color="text.secondary" mb={0.5}>Deployment Queued</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 340, textAlign: 'center' }}>
              Your deployment is saved and will start automatically when you&apos;re back online — you can add vehicles and items once it syncs.
            </Typography>
          </>
        ) : (
          <>
            <Typography variant="h6" color="text.secondary">No active deployment</Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Start a deployment when you pick up a rig or kit from a hub.
            </Typography>
            <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={() => setNewOpen(true)}>
              Start Deployment
            </Button>
            {newOpen && (
              <NewDeploymentDialog
                vehicles={vehicles}
                inventoryItems={inventoryItems}
                operators={operators}
                hubs={hubs}
                homeHubId={user?.homeHubId}
                pickupPreset={pickupPreset}
                onClose={() => { setNewOpen(false); setPickupPreset(null); void refreshQueue() }}
                onSuccess={load}
              />
            )}
          </>
        )}

        {/* Handoff respond dialog (accessible when operator has no rig — they're the recipient) */}
        <Dialog open={!!handoffRespondDialog} onClose={() => setHandoffRespondDialog(null)} maxWidth="xs" fullWidth>
          <DialogTitle>{handoffRespondDialog?.action === 'accept' ? 'Accept Handoff' : 'Decline Handoff'}</DialogTitle>
          <DialogContent>
            {handoffRespondDialog?.action === 'accept' && (
              <Typography variant="body2" color="text.secondary" mb={1.5}>
                You will become the primary operator for this deployment.
              </Typography>
            )}
            <TextField
              label="Response note (optional)"
              value={handoffResponseNote}
              onChange={(e) => setHandoffResponseNote(e.target.value)}
              multiline rows={2} fullWidth sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setHandoffRespondDialog(null)} disabled={handoffRespondLoading}>Cancel</Button>
            <Button
              variant="contained"
              color={handoffRespondDialog?.action === 'accept' ? 'success' : 'error'}
              onClick={handleHandoffRespond}
              disabled={handoffRespondLoading}
              startIcon={handoffRespondLoading ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {handoffRespondLoading ? 'Saving…' : handoffRespondDialog?.action === 'accept' ? 'Accept' : 'Decline'}
            </Button>
          </DialogActions>
        </Dialog>
        {/* Transfer accept/decline dialog — needed here so a rig-less recipient can respond (B3) */}
        <Dialog open={!!respondDialog} onClose={() => setRespondDialog(null)} maxWidth="xs" fullWidth>
          <DialogTitle>{respondDialog?.action === 'accept' ? 'Accept Transfer' : 'Decline Transfer'}</DialogTitle>
          <DialogContent>
            {respondDialog?.action === 'accept' && (
              <Typography variant="body2" color="text.secondary" mb={1.5}>
                Accepting will start a new deployment for you and add the transferred equipment to it.
              </Typography>
            )}
            <TextField
              label="Response note (optional)"
              value={responseNote}
              onChange={(e) => setResponseNote(e.target.value)}
              multiline rows={2} fullWidth sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setRespondDialog(null)} disabled={respondLoading}>Cancel</Button>
            <Button
              variant="contained"
              color={respondDialog?.action === 'accept' ? 'success' : 'error'}
              onClick={handleRespond}
              disabled={respondLoading}
              startIcon={respondLoading ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {respondLoading ? 'Saving…' : respondDialog?.action === 'accept' ? 'Accept' : 'Decline'}
            </Button>
          </DialogActions>
        </Dialog>
        <Dialog open={!!cancelHandoffId} onClose={() => setCancelHandoffId(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Cancel Handoff</DialogTitle>
          <DialogContent>
            <Typography>Are you sure you want to cancel this pending handoff request?</Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setCancelHandoffId(null)} disabled={cancelHandoffLoading}>Keep</Button>
            <Button variant="contained" color="error" onClick={handleHandoffCancel}
              disabled={cancelHandoffLoading}
              startIcon={cancelHandoffLoading ? <CircularProgress size={16} color="inherit" /> : null}>
              {cancelHandoffLoading ? 'Cancelling…' : 'Cancel Handoff'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    )
  }

  return (
    <Box>
      {/* Incoming handoff banners */}
      {incomingHandoffs.map((h) => (
        <Alert
          key={h.id}
          severity="info"
          sx={{ mb: 1.5 }}
        >
          <Typography variant="body2" fontWeight={600}>
            Deployment Handoff from {h.fromOperatorName}
          </Typography>
          <Typography variant="caption" color="text.secondary">&ldquo;{h.note}&rdquo;</Typography>
          {/* CC-23: actions in the body (was the Alert `action` slot + mt:-0.5). */}
          <Stack direction="row" spacing={1} sx={{ mt: 1, '& .MuiButton-root': { minHeight: 44, fontSize: 16 } }}>
            <Button size="small" color="error" variant="outlined"
              onClick={() => { setHandoffRespondDialog({ handoff: h, action: 'decline' }); setHandoffResponseNote('') }}>
              Decline
            </Button>
            <Button size="small" color="success" variant="contained"
              onClick={() => { setHandoffRespondDialog({ handoff: h, action: 'accept' }); setHandoffResponseNote('') }}>
              Accept
            </Button>
          </Stack>
        </Alert>
      ))}

      {/* Incoming transfer banners */}
      {incomingTransfers.map((tr) => {
        const vehicleNames = tr.vehicles.map((tv) => tv.vehicle.name).join(', ')
        // Show the quantity being transferred (TransferItem.quantity), not the
        // source kit item's total. Falls back to the kit-item total for whole/
        // serialized transfers where no per-line quantity was set.
        const itemNames = tr.items.map((ti) => `${ti.kitItem.item.name} ×${ti.quantity ?? ti.kitItem.quantity}`).join(', ')
        const summary = [vehicleNames, itemNames].filter(Boolean).join(', ')
        return (
          <Alert
            key={tr.id}
            severity="info"
            sx={{ mb: 1.5 }}
          >
            <Typography variant="body2" fontWeight={600}>
              Incoming Transfer from {tr.fromRig.operator.name}
            </Typography>
            <Typography variant="body2">{summary}</Typography>
            <Typography variant="caption" color="text.secondary">&ldquo;{tr.note}&rdquo;</Typography>
            {/* CC-23: actions in the body (was the Alert `action` slot + mt:-0.5). */}
            <Stack direction="row" spacing={1} sx={{ mt: 1, '& .MuiButton-root': { minHeight: 44, fontSize: 16 } }}>
              <Button size="small" color="error" variant="outlined"
                onClick={() => { setRespondDialog({ transfer: tr, action: 'decline' }); setResponseNote('') }}>
                Decline
              </Button>
              <Button size="small" color="success" variant="contained"
                onClick={() => { setRespondDialog({ transfer: tr, action: 'accept' }); setResponseNote('') }}>
                Accept
              </Button>
            </Stack>
          </Alert>
        )
      })}

      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5">My Deployment</Typography>
          <Stack direction="row" spacing={1} mt={0.5} alignItems="center">
            {rig.project && <Chip size="small" label={rig.project.name} color="primary" />}
            <Typography variant="body2" color="text.secondary">
              Started {formatDate(rig.startedAt)}
            </Typography>
          </Stack>
        </Box>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={2}>
        {/* CC-12 PR3: extracted, memoized presentational cards (the perf split). */}
        <DeploymentVehiclesCard
          vehicles={rig.vehicles}
          removingVehicles={removingVehicles}
          selVehicles={selVehicles}
          setSelVehicles={setSelVehicles}
          setRemovingVehicles={setRemovingVehicles}
          onAddVehicles={onAddVehicles}
          onRemoveSelected={onRemoveVehiclesSelected}
        />
        <DeploymentKitCard
          kitItems={kitItems}
          removingItems={removingItems}
          selItems={selItems}
          setSelItems={setSelItems}
          setRemovingItems={setRemovingItems}
          onAddItems={onAddItems}
          onRemoveSelected={onRemoveItemsSelected}
          onLogUsage={onLogUsage}
          onReturnItem={onReturnItem}
        />
      </Stack>

      {/* Outgoing pending transfer notice */}
      {outgoingTransfers.map((tr) => {
        const vehicleNames = tr.vehicles.map((tv) => tv.vehicle.name).join(', ')
        const itemNames = tr.items.map((ti) => `${ti.kitItem.item.name} ×${ti.quantity ?? ti.kitItem.quantity}`).join(', ')
        const summary = [vehicleNames, itemNames].filter(Boolean).join(', ')
        return (
          <Alert key={tr.id} severity="warning" icon={false} sx={{ mb: 1.5 }}
            action={
              <Button size="small" color="error" onClick={() => setCancelTransferId(tr.id)}>
                Cancel Transfer
              </Button>
            }
          >
            <Typography variant="body2">
              ⏳ Waiting for <strong>{tr.toOperator.name}</strong> to accept your transfer of {summary}
            </Typography>
          </Alert>
        )
      })}

      {/* Outgoing pending handoff notice */}
      {outgoingHandoffs.map((h) => (
        <Alert key={h.id} severity="warning" icon={false} sx={{ mb: 1.5 }}
          action={
            <Button size="small" color="error" onClick={() => setCancelHandoffId(h.id)}>
              Cancel Handoff
            </Button>
          }
        >
          <Typography variant="body2">
            ⏳ Waiting for <strong>{h.toOperatorName}</strong> to accept your deployment handoff
          </Typography>
          <Typography variant="caption" color="text.secondary">&ldquo;{h.note}&rdquo;</Typography>
        </Alert>
      ))}

      {/* Action row — CC-24: stacks vertically below sm so all three render as
          full, tappable outlined buttons at 390px (was a fixed row that clipped
          End Deployment off the right edge on a phone). End Deployment is now an
          outlined error button too, matching the others. */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="stretch">
        <Button variant="outlined" fullWidth startIcon={<SwapHorizIcon />}
          onClick={() => setTransferOpen(true)}>
          Transfer Equipment
        </Button>
        <Button variant="outlined" fullWidth startIcon={<GroupIcon />}
          onClick={() => { setHandoffOpen(true); setHandoffTargetId(''); setHandoffNote('') }}>
          Hand Off Deployment
        </Button>
        <Button variant="outlined" color="error" fullWidth startIcon={<StopCircleIcon />}
          onClick={() => setNoteDialog('end')}>
          End Deployment
        </Button>
      </Stack>

      {/* Add Vehicles picker */}
      <Dialog open={addVehicleOpen} onClose={() => {
        setAddVehicleOpen(false); setPendingVehicles(new Set())
        setIsRentalToggle(false); setRentalFields({}); setRentalError('')
      }} maxWidth="sm" fullWidth>
        <DialogTitle>Add Vehicles</DialogTitle>
        <DialogContent>
          <FormControlLabel
            control={<Switch checked={isRentalToggle} onChange={(e) => { setIsRentalToggle(e.target.checked); setRentalFields({}) }} />}
            label="This is a rental vehicle"
            sx={{ mb: 1 }}
          />
          {isRentalToggle ? (
            <>
              {rentalError && <Alert severity="error" sx={{ mb: 1 }}>{rentalError}</Alert>}
              <RentalVehicleForm value={rentalFields} onChange={setRentalFields} disabled={rentalSubmitLoading} />
            </>
          ) : (
            <>
              <Divider sx={{ mb: 1 }} />
              {unassignedVehicles.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No available vehicles.</Typography>
              ) : (
                <List dense disablePadding>
                  {groupBy(
                    [...unassignedVehicles].sort((a, b) => a.name.localeCompare(b.name)),
                    (v) => v.type,
                    [...VEHICLE_TYPE_ORDER],
                  ).map(({ group, items: gv }) => (
                    <React.Fragment key={group}>
                      <ListSubheader sx={{ lineHeight: '32px', bgcolor: 'background.default' }}>
                        {vehicleTypeLabel(group)}
                      </ListSubheader>
                      {gv.map((v) => {
                        const Icon = VEHICLE_ICON[v.type] ?? LocalShippingIcon
                        return (
                          <ListItem key={v.id} disablePadding sx={{ minHeight: 44 }}>
                            <ListItemIcon sx={{ minWidth: 36 }}>
                              <Checkbox size="small" checked={pendingVehicles.has(v.id)}
                                onChange={(e) => {
                                  const s = new Set(pendingVehicles)
                                  e.target.checked ? s.add(v.id) : s.delete(v.id)
                                  setPendingVehicles(s)
                                }} />
                            </ListItemIcon>
                            <ListItemIcon sx={{ minWidth: 32 }}><Icon fontSize="small" /></ListItemIcon>
                            <ListItemText primary={v.name} />
                          </ListItem>
                        )
                      })}
                    </React.Fragment>
                  ))}
                </List>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => {
            setAddVehicleOpen(false); setPendingVehicles(new Set())
            setIsRentalToggle(false); setRentalFields({}); setRentalError('')
          }}>Cancel</Button>
          {isRentalToggle ? (
            <Button variant="contained"
              disabled={rentalSubmitLoading || !isRentalFormValid(rentalFields)}
              startIcon={rentalSubmitLoading ? <CircularProgress size={16} color="inherit" /> : null}
              onClick={async () => {
                if (!rig) return
                setRentalError('')
                // P2-D: adding a rental is a two-step dependent create (vehicle →
                // attach) that isn't safely queueable, so require connectivity and
                // tell the operator plainly — mirrors the transfer/handoff guards.
                if (typeof navigator !== 'undefined' && !navigator.onLine) {
                  setRentalError('Adding a rental needs an internet connection. Try again when you’re back online.')
                  return
                }
                if (rentalSubmitRef.current) return // Q1: block a same-tick double-tap
                rentalSubmitRef.current = true
                setRentalSubmitLoading(true)
                try {
                  const payload = rentalFieldsToVehiclePayload(rentalFields)
                  const vRes = await fetch('/api/vehicles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  })
                  // Guard .json() — a non-JSON response (auth redirect, 502) must
                  // surface an error, not throw past the catch and leave the dialog
                  // looking like nothing happened.
                  const vJson = await vRes.json().catch(() => ({} as { data?: { id: string }; error?: unknown }))
                  if (!vRes.ok) {
                    const e = (vJson as { error?: { formErrors?: string[] } | string }).error
                    setRentalError((typeof e === 'object' && e?.formErrors?.[0]) || (typeof e === 'string' ? e : '') || 'Failed to create vehicle')
                    return
                  }
                  const vehicleId: string | undefined = (vJson as { data?: { id: string } }).data?.id
                  if (!vehicleId) { setRentalError('Failed to create vehicle'); return }
                  const addRes = await fetch(`/api/deployments/${rig.id}/vehicles`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vehicleIds: [vehicleId], note: 'Added rental vehicle', photoUrls: [] }),
                  })
                  if (!addRes.ok) {
                    const addJson = await addRes.json().catch(() => ({}))
                    setRentalError(addJson.error?.formErrors?.[0] ?? addJson.error ?? 'Failed to add vehicle to deployment')
                    return
                  }
                  setAddVehicleOpen(false)
                  setIsRentalToggle(false)
                  setRentalFields({})
                  await load()
                } catch (e) {
                  setRentalError(e instanceof Error ? e.message : 'Failed to add rental vehicle')
                } finally {
                  setRentalSubmitLoading(false)
                  rentalSubmitRef.current = false
                }
              }}>
              {rentalSubmitLoading ? 'Adding…' : 'Add Rental Vehicle'}
            </Button>
          ) : (
            <Button variant="contained" disabled={pendingVehicles.size === 0}
              onClick={() => { setAddVehicleOpen(false); setNoteDialog('addVehicles') }}>
              Continue
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Add Items picker */}
      <Dialog open={addItemOpen} onClose={() => { setAddItemOpen(false); setPendingItems(new Map()); setAddItemSourceHubId('') }} maxWidth="sm" fullWidth>
        <DialogTitle>Add Items</DialogTitle>
        <DialogContent>
          {inventoryItems.filter((i) => availFor(i) > 0).length === 0 ? (
            <Typography variant="body2" color="text.secondary">No available items.</Typography>
          ) : (
            <Box mt={1}>
              {groupBy(
                [...inventoryItems.filter((i) => availFor(i) > 0)].sort((a, b) => a.name.localeCompare(b.name)),
                (item) => item.category?.name ?? 'Uncategorized',
              ).map(({ group, items: gi }) => (
                <React.Fragment key={group}>
                  <Typography variant="overline" color="text.secondary"
                    sx={{ display: 'block', px: 0.5, mt: 1.5, mb: 0.5, lineHeight: '26px', borderBottom: '1px solid', borderColor: 'divider' }}>
                    {group}
                  </Typography>
                  <Stack spacing={1.5}>
              {gi.map((item) => {
                const entry = pendingItems.get(item.id)
                const checked = !!entry
                const isSerialized = item.itemType === 'SERIALIZED'

                const addHubRow = !isSerialized && addItemSourceHubId ? item.hubStock?.find((s) => s.hubId === addItemSourceHubId) : undefined
                const addHubAvail = !isSerialized ? (addHubRow?.available ?? (item.availableQuantity ?? 0)) : 0
                return (
                  <Box key={item.id}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Checkbox size="small" checked={checked}
                        onChange={(e) => {
                          const m = new Map(pendingItems)
                          if (e.target.checked) {
                            m.set(item.id, { itemType: isSerialized ? 'SERIALIZED' : 'CONSUMABLE', quantity: 1, inventoryUnitId: null, unitLabel: null })
                          } else {
                            m.delete(item.id)
                          }
                          setPendingItems(m)
                        }} />
                      <Box flexGrow={1}>
                        <Typography variant="body2">{item.name}</Typography>
                      </Box>
                      {checked && !isSerialized && (
                        <TextField
                          type="number"
                          size="small"
                          value={entry?.quantity ?? 1}
                          onChange={(e) => {
                            const m = new Map(pendingItems)
                            const v = Math.min(parseInt(e.target.value) || 1, addHubAvail)
                            m.set(item.id, { itemType: 'CONSUMABLE', quantity: v, inventoryUnitId: null, unitLabel: null })
                            setPendingItems(m)
                          }}
                          inputProps={{ min: 1, max: addHubAvail, style: { MozAppearance: 'textfield', width: 60 } }}
                          helperText={stockAvailabilityLabel(addHubRow, addHubAvail)}
                          sx={{ width: 80, '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': { display: 'none' } }}
                        />
                      )}
                    </Stack>

                    {/* SERIALIZED: unit selector */}
                    {checked && isSerialized && (
                      <Box pl={5} mt={0.5}>
                        {entry?.inventoryUnitId ? (
                          <Alert severity="success" sx={{ py: 0.25 }} onClose={() => {
                            const m = new Map(pendingItems)
                            m.set(item.id, { itemType: 'SERIALIZED', quantity: 1, inventoryUnitId: null, unitLabel: null })
                            setPendingItems(m)
                          }}>
                            Unit: {entry.unitLabel ?? entry.inventoryUnitId.slice(0, 8)}
                          </Alert>
                        ) : (
                          <Stack spacing={1}>
                            {/* CC-25: live scanner (manual entry lives inside the dialog). */}
                            <Button size="small" variant="outlined" startIcon={<QrCodeScannerIcon />}
                              onClick={() => setPendingScanId(item.id)} sx={{ alignSelf: 'flex-start' }}>
                              Scan QR
                            </Button>
                            <TextField select size="small" label="Pick from list"
                              value=""
                              onChange={(e) => {
                                const unit = item.availableUnits?.find((u) => u.id === e.target.value)
                                if (!unit) return
                                const m = new Map(pendingItems)
                                m.set(item.id, { itemType: 'SERIALIZED', quantity: 1, inventoryUnitId: unit.id, unitLabel: unit.serialNumber ?? `Unit ${unit.position}` })
                                setPendingItems(m)
                              }}>
                              <MenuItem value="" disabled>Select a unit…</MenuItem>
                              {(item.availableUnits ?? []).map((u) => (
                                <MenuItem key={u.id} value={u.id}>
                                  {u.serialNumber ?? `Unit ${u.position}`}
                                </MenuItem>
                              ))}
                            </TextField>
                          </Stack>
                        )}
                      </Box>
                    )}
                  </Box>
                )
              })}
                  </Stack>
                </React.Fragment>
              ))}
            </Box>
          )}
        </DialogContent>
        {Array.from(pendingItems.values()).some((e) => e.itemType === 'CONSUMABLE') && (
          <Box sx={{ px: 3, pb: 1 }}>
            {hubs.length === 0 ? (
              <Alert severity="error">
                No active hubs configured — consumable checkout is unavailable. Contact an admin to set up a hub.
              </Alert>
            ) : (
              <TextField
                select
                label="Source hub (required for consumables)"
                value={addItemSourceHubId}
                onChange={(e) => setAddItemSourceHubId(e.target.value)}
                fullWidth
                size="small"
              >
                <MenuItem value="" disabled>Select a hub…</MenuItem>
                {hubs.map((h) => (
                  <MenuItem key={h.id} value={h.id}>{h.name} — {h.city}, {h.state}</MenuItem>
                ))}
              </TextField>
            )}
          </Box>
        )}
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setAddItemOpen(false); setPendingItems(new Map()); setAddItemSourceHubId('') }}>Cancel</Button>
          <Button variant="contained"
            disabled={
              pendingItems.size === 0 ||
              Array.from(pendingItems.values()).some(e => e.itemType === 'SERIALIZED' && !e.inventoryUnitId) ||
              (Array.from(pendingItems.values()).some(e => e.itemType === 'CONSUMABLE') && !addItemSourceHubId)
            }
            onClick={() => { setAddItemOpen(false); setNoteDialog('addItems') }}>
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      {/* Note dialogs */}
      <NotePhotoDialog
        open={noteDialog === 'addVehicles'}
        title="Add vehicles to rig"
        presets={NOTE_PRESETS}
        loading={actionLoading}
        onClose={() => setNoteDialog(null)}
        onConfirm={(note, photoUrls) => doAction('addVehicles', note, photoUrls)}
        confirmLabel="Add Vehicles"
      />
      <NotePhotoDialog
        open={noteDialog === 'removeVehicles'}
        title={`Remove ${selVehicles.size} vehicle(s)`}
        presets={NOTE_PRESETS}
        loading={actionLoading}
        onClose={() => setNoteDialog(null)}
        onConfirm={(note, photoUrls) => doAction('removeVehicles', note, photoUrls)}
        confirmLabel="Remove"
        confirmColor="error"
      />
      <NotePhotoDialog
        open={noteDialog === 'addItems'}
        title="Add items to kit"
        presets={NOTE_PRESETS}
        loading={actionLoading}
        onClose={() => setNoteDialog(null)}
        onConfirm={(note, photoUrls) => doAction('addItems', note, photoUrls)}
        confirmLabel="Add Items"
      />
      {/* CC-24: the per-item "Return Item" dialog is gone — the per-row ⊖ now
          opens the shared DispositionDialog pre-filtered to that one item (see
          the singleRemoveItem render below), so single and bulk removal share one
          path and one set of return dispositions. */}

      {/* Log Usage dialog — consumables only */}
      <Dialog open={logUsageDialog.open} onClose={() => setLogUsageDialog({ open: false, kitItem: null })} maxWidth="xs" fullWidth>
        <DialogTitle>Log Daily Usage</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Record how many <strong>{logUsageDialog.kitItem?.item.name}</strong> were consumed today.
            Remaining in kit: {logUsageDialog.kitItem?.quantity ?? 0}
          </Typography>
          <TextField
            type="number"
            label="Quantity used"
            value={logUsageQty}
            onChange={(e) => setLogUsageQty(Math.max(1, Math.min(parseInt(e.target.value) || 1, logUsageDialog.kitItem?.quantity ?? 1)))}
            inputProps={{ min: 1, max: logUsageDialog.kitItem?.quantity ?? 1 }}
            fullWidth
            autoFocus
          />
          {logUsageQty >= (logUsageDialog.kitItem?.quantity ?? 0) && (
            <Typography variant="caption" color="warning.main" mt={1} display="block">
              This will remove all remaining units from your kit.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setLogUsageDialog({ open: false, kitItem: null })} disabled={logUsageLoading}>Cancel</Button>
          <Button variant="contained" onClick={handleLogUsage} disabled={logUsageLoading}
            startIcon={logUsageLoading ? <CircularProgress size={16} /> : undefined}>
            {logUsageLoading ? 'Saving…' : 'Log Usage'}
          </Button>
        </DialogActions>
      </Dialog>

      {noteDialog === 'removeItems' && selItems.size > 0 && (
        <DispositionDialog
          open={true}
          mode="remove-items"
          deploymentId={rig.id}
          currentOperatorId={rig.operator.id}
          operators={operators}
          hubs={hubs}
          presets={NOTE_PRESETS}
          items={kitItems
            .filter((ki) => selItems.has(ki.id))
            .map<KitItemSummary>((ki) => ({
              kitItemId: ki.id,
              itemId: ki.item.id,
              name: ki.item.name,
              quantity: ki.quantity,
              itemType: ki.item.itemType,
              inventoryUnit: ki.inventoryUnit ?? null,
            }))}
          onComplete={() => {
            setNoteDialog(null)
            setRemovingItems(false)
            setSelItems(new Set())
            void load()
          }}
          onClose={() => setNoteDialog(null)}
        />
      )}
      {/* CC-24: single-item remove — the per-row ⊖ routes through the SAME
          DispositionDialog, pre-filtered to one item (2 taps: ⊖ → confirm). */}
      {singleRemoveItem && (
        <DispositionDialog
          open={true}
          mode="remove-items"
          deploymentId={rig.id}
          currentOperatorId={rig.operator.id}
          operators={operators}
          hubs={hubs}
          presets={NOTE_PRESETS}
          items={[{
            kitItemId: singleRemoveItem.id,
            itemId: singleRemoveItem.item.id,
            name: singleRemoveItem.item.name,
            quantity: singleRemoveItem.quantity,
            itemType: singleRemoveItem.item.itemType,
            inventoryUnit: singleRemoveItem.inventoryUnit ?? null,
          }]}
          onComplete={() => {
            setSingleRemoveItem(null)
            void load()
          }}
          onClose={() => setSingleRemoveItem(null)}
        />
      )}
      {noteDialog === 'end' && (
        <DispositionDialog
          open={true}
          mode="end-deployment"
          deploymentId={rig.id}
          currentOperatorId={rig.operator.id}
          operators={operators}
          hubs={hubs}
          presets={NOTE_PRESETS}
          items={kitItems.map<KitItemSummary>((ki) => ({
            kitItemId: ki.id,
            itemId: ki.item.id,
            name: ki.item.name,
            quantity: ki.quantity,
            itemType: ki.item.itemType,
            inventoryUnit: ki.inventoryUnit ?? null,
          }))}
          onComplete={() => {
            setNoteDialog(null)
            void load()
          }}
          onClose={() => setNoteDialog(null)}
        />
      )}

      {/* CC-25: shared live scanner for the add-items serial-unit slots. */}
      <QrScannerDialog
        open={pendingScanId !== null}
        onClose={() => setPendingScanId(null)}
        title="Scan unit QR"
        prompt="Scan the serial unit's QR label for this item."
        onResolve={resolvePendingUnit}
      />

      {transferOpen && (
        <TransferDialog
          rig={rig}
          operators={operators.filter((o) => o.id !== rig.operator.id)}
          onClose={() => setTransferOpen(false)}
          onSuccess={load}
          showToast={showToast}
          blockOffline
          resolvePhotos
        />
      )}

      {/* Accept / Decline respond dialog */}
      <Dialog open={!!respondDialog} onClose={() => setRespondDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{respondDialog?.action === 'accept' ? 'Accept Transfer' : 'Decline Transfer'}</DialogTitle>
        <DialogContent>
          <TextField
            label="Response note (optional)"
            value={responseNote}
            onChange={(e) => setResponseNote(e.target.value)}
            multiline
            rows={2}
            fullWidth
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRespondDialog(null)} disabled={respondLoading}>Cancel</Button>
          <Button
            variant="contained"
            color={respondDialog?.action === 'accept' ? 'success' : 'error'}
            onClick={handleRespond}
            disabled={respondLoading}
            startIcon={respondLoading ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {respondLoading ? 'Saving…' : respondDialog?.action === 'accept' ? 'Accept' : 'Decline'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Cancel transfer confirm */}
      <Dialog open={!!cancelTransferId} onClose={() => setCancelTransferId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel Transfer</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to cancel this pending transfer?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCancelTransferId(null)} disabled={cancelLoading}>Keep</Button>
          <Button variant="contained" color="error" onClick={handleCancelTransfer}
            disabled={cancelLoading}
            startIcon={cancelLoading ? <CircularProgress size={16} color="inherit" /> : null}>
            {cancelLoading ? 'Cancelling…' : 'Cancel Transfer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Hand off deployment — initiate dialog */}
      <Dialog open={handoffOpen} onClose={() => setHandoffOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Hand Off Deployment</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Transfer primary responsibility to another operator. They will need to accept before the handoff takes effect.
          </Typography>
          <Box sx={{ mb: 2 }}>
            <SearchableSelect
              label="Hand off to"
              value={handoffTargetId}
              onChange={setHandoffTargetId}
              options={operators.filter((o) => o.id !== rig.operator.id).map((o) => ({ value: o.id, label: o.name }))}
            />
          </Box>
          <TextField
            label="Note (required)"
            value={handoffNote}
            onChange={(e) => setHandoffNote(e.target.value)}
            multiline rows={2} fullWidth
            placeholder="e.g. Heading home — handing off to cover the weekend"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setHandoffOpen(false)} disabled={handoffLoading}>Cancel</Button>
          <Button variant="contained" color="warning"
            disabled={!handoffTargetId || !handoffNote.trim() || handoffLoading}
            onClick={handleHandoffInitiate}
            startIcon={handoffLoading ? <CircularProgress size={16} color="inherit" /> : null}>
            {handoffLoading ? 'Sending…' : 'Send Handoff Request'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Handoff accept / decline respond dialog */}
      <Dialog open={!!handoffRespondDialog} onClose={() => setHandoffRespondDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{handoffRespondDialog?.action === 'accept' ? 'Accept Handoff' : 'Decline Handoff'}</DialogTitle>
        <DialogContent>
          {handoffRespondDialog?.action === 'accept' && (
            <Typography variant="body2" color="text.secondary" mb={1.5}>
              You will become the primary operator for this deployment.
            </Typography>
          )}
          <TextField
            label="Response note (optional)"
            value={handoffResponseNote}
            onChange={(e) => setHandoffResponseNote(e.target.value)}
            multiline rows={2} fullWidth sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setHandoffRespondDialog(null)} disabled={handoffRespondLoading}>Cancel</Button>
          <Button
            variant="contained"
            color={handoffRespondDialog?.action === 'accept' ? 'success' : 'error'}
            onClick={handleHandoffRespond}
            disabled={handoffRespondLoading}
            startIcon={handoffRespondLoading ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {handoffRespondLoading ? 'Saving…' : handoffRespondDialog?.action === 'accept' ? 'Accept' : 'Decline'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Cancel handoff confirm */}
      <Dialog open={!!cancelHandoffId} onClose={() => setCancelHandoffId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel Handoff</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to cancel this pending handoff request?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCancelHandoffId(null)} disabled={cancelHandoffLoading}>Keep</Button>
          <Button variant="contained" color="error" onClick={handleHandoffCancel}
            disabled={cancelHandoffLoading}
            startIcon={cancelHandoffLoading ? <CircularProgress size={16} color="inherit" /> : null}>
            {cancelHandoffLoading ? 'Cancelling…' : 'Cancel Handoff'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
