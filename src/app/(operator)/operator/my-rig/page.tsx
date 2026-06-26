'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Stack, Card, CardContent,
  Chip, CircularProgress, Checkbox, TextField, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, List,
  ListItem, ListItemText, ListItemIcon, ListSubheader, Stepper, Step, StepLabel,
  Alert, Switch, FormControlLabel, Divider, IconButton, Tooltip,
} from '@mui/material'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import TerrainIcon from '@mui/icons-material/Terrain'
import AgricultureIcon from '@mui/icons-material/Agriculture'
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
import { RentalVehicleForm, RentalVehicleFields } from '@/components/shared/RentalVehicleForm'
import { useToast } from '@/components/shared/useToast'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { useAuth } from '@/hooks/useAuth'
import { groupBy } from '@/lib/utils'

const VEHICLE_TYPE_ORDER = ['TRUCK', 'TRAILER', 'POLARIS_UTV', 'CAN_AM_UTV', 'CHRISTIE_DRILL', 'ATV', 'OTHER']

// ── Types ─────────────────────────────────────────────────────────

const VEHICLE_ICON: Record<string, React.ElementType> = {
  TRUCK: LocalShippingIcon,
  TRAILER: LocalShippingIcon,
  POLARIS_UTV: TerrainIcon,
  CAN_AM_UTV: TerrainIcon,
  ATV: TerrainIcon,
  CHRISTIE_DRILL: AgricultureIcon,
  OTHER: LocalShippingIcon,
}

interface RigVehicleRow {
  id: string
  vehicle: { id: string; name: string; type: string; isRental: boolean }
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

function NewDeploymentDialog({
  vehicles,
  inventoryItems,
  operators,
  hubs,
  homeHubId,
  onClose,
  onSuccess,
}: {
  vehicles: VehicleOption[]
  inventoryItems: InventoryOption[]
  operators: UserOption[]
  hubs: HubOption[]
  homeHubId?: string | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [step, setStep] = React.useState(0)
  const [label, setLabel] = React.useState('')
  const [selVehicles, setSelVehicles] = React.useState<Set<string>>(new Set())
  const [kitItems, setKitItems] = React.useState<Map<string, PendingItemEntry>>(new Map())
  const [unitManualQR, setUnitManualQR] = React.useState<Record<string, string>>({})
  const [unitQrLoading, setUnitQrLoading] = React.useState<Record<string, boolean>>({})
  const [note, setNote] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  // Prefer operator's home hub if it's in the active hub list; fall back to first hub.
  const [sourceHubId, setSourceHubId] = React.useState(
    () => (homeHubId && hubs.some((h) => h.id === homeHubId) ? homeHubId : hubs[0]?.id) ?? '',
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

  const handleDialogQRScan = (itemId: string) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUnitQrLoading((p) => ({ ...p, [itemId]: true }))
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width; canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
      const jsQR = (await import('jsqr')).default
      const result = jsQR(imgData.data, bitmap.width, bitmap.height)
      if (!result?.data) return
      const res = await fetch(`/api/inventory/units/by-qr/${encodeURIComponent(result.data)}`)
      if (res.ok) {
        const json = await res.json()
        const item = availableItems.find((i) => i.id === itemId)
        if (json.unit?.inventoryItemId === itemId && json.unit?.status === 'AVAILABLE') {
          const m = new Map(kitItems)
          m.set(itemId, { itemType: 'SERIALIZED', quantity: 1, inventoryUnitId: json.unit.id, unitLabel: json.unit.serialNumber ?? `Unit ${json.unit.position}` })
          setKitItems(m)
        }
        void item
      }
    } finally {
      setUnitQrLoading((p) => ({ ...p, [itemId]: false }))
      e.target.value = ''
    }
  }

  const lookupDialogManualQR = async (itemId: string) => {
    const qr = unitManualQR[itemId]?.trim()
    if (!qr) return
    setUnitQrLoading((p) => ({ ...p, [itemId]: true }))
    try {
      const res = await fetch(`/api/inventory/units/by-qr/${encodeURIComponent(qr)}`)
      if (res.ok) {
        const json = await res.json()
        if (json.unit?.inventoryItemId === itemId && json.unit?.status === 'AVAILABLE') {
          const m = new Map(kitItems)
          m.set(itemId, { itemType: 'SERIALIZED', quantity: 1, inventoryUnitId: json.unit.id, unitLabel: json.unit.serialNumber ?? `Unit ${json.unit.position}` })
          setKitItems(m)
        }
      }
    } finally {
      setUnitQrLoading((p) => ({ ...p, [itemId]: false }))
    }
  }

  const hasConsumableInKit = Array.from(kitItems.values()).some((e) => e.itemType === 'CONSUMABLE')

  const launch = async () => {
    if (!note.trim()) { setError('Note is required'); return }
    if (hasConsumableInKit && !sourceHubId) { setError('Select a source hub for consumable items.'); return }
    setLoading(true)
    setError('')
    const res = await fetch('/api/deployments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: label || undefined,
        note,
        vehicleIds: Array.from(selVehicles),
        kitItems: Array.from(kitItems.entries()).map(([inventoryItemId, entry]) =>
          entry.itemType === 'SERIALIZED'
            ? { itemType: 'SERIALIZED', inventoryItemId, inventoryUnitId: entry.inventoryUnitId! }
            : { inventoryItemId, quantity: entry.quantity }
        ),
        ...(sourceHubId && { sourceHubId }),
      }),
    })
    if (res.status === 409) {
      const d = await res.json()
      const m = new Map(kitItems)
      m.forEach((entry, itemId) => {
        if (entry.itemType === 'SERIALIZED') {
          m.set(itemId, { itemType: 'SERIALIZED', quantity: 1, inventoryUnitId: null, unitLabel: null })
        }
      })
      setKitItems(m)
      setStep(2)
      setError(d.error ?? 'A unit was just taken. Please reselect.')
      setLoading(false)
      return
    }
    setLoading(false)
    if (res.ok) { onSuccess(); onClose() }
    else { const d = await res.json(); setError(d.error?.formErrors?.[0] ?? d.error ?? 'Failed') }
  }

  return (
    <Dialog open={true} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Start Deployment</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 3, mt: 1 }}>
          <Step><StepLabel>Details</StepLabel></Step>
          <Step><StepLabel>Build Rig</StepLabel></Step>
          <Step><StepLabel>Build Kit</StepLabel></Step>
          <Step><StepLabel>Launch</StepLabel></Step>
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
                  VEHICLE_TYPE_ORDER,
                ).map(({ group, items: gv }) => (
                  <React.Fragment key={group}>
                    <ListSubheader sx={{ lineHeight: '32px', bgcolor: 'background.default' }}>
                      {group.replace(/_/g, ' ')}
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
                        const hubAvail = !isSerialized
                          ? (sourceHubId
                              ? (item.hubStock?.find((s) => s.hubId === sourceHubId)?.available ?? (item.availableQuantity ?? 0))
                              : (item.availableQuantity ?? 0))
                          : 0
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
                                  helperText={`${hubAvail} avail.`}
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
                                    <Stack direction="row" spacing={1} alignItems="center">
                                      <Button component="label" size="small" variant="outlined" startIcon={<QrCodeScannerIcon />}
                                        disabled={!!unitQrLoading[item.id]}>
                                        Scan QR
                                        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                                          onChange={handleDialogQRScan(item.id)} />
                                      </Button>
                                      <TextField size="small" placeholder="Enter QR code" value={unitManualQR[item.id] ?? ''}
                                        onChange={(e) => setUnitManualQR((p) => ({ ...p, [item.id]: e.target.value }))}
                                        sx={{ width: 160 }} />
                                      <Button size="small" onClick={() => lookupDialogManualQR(item.id)}
                                        disabled={!unitManualQR[item.id]?.trim() || !!unitQrLoading[item.id]}>
                                        Look Up
                                      </Button>
                                    </Stack>
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
          </Box>
        )}

        {step === 3 && (
          <TextField
            label="Deployment note (required)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline rows={3}
            fullWidth
            placeholder="e.g. Heading out for TX soil sampling run"
            required
            autoFocus
          />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        {step > 0 && <Button onClick={() => setStep((s) => s - 1)} disabled={loading}>Back</Button>}
        {step < 3 ? (
          <Button variant="contained" onClick={() => setStep((s) => s + 1)}>Next</Button>
        ) : (
          <Button variant="contained" onClick={launch} disabled={!note.trim() || loading || hasUnselectedSerialized || (hasConsumableInKit && !sourceHubId)}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}>
            {loading ? 'Launching…' : 'Launch Deployment'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
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
  const { mutate } = useOfflineQueue()
  const { user } = useAuth()
  const [newOpen, setNewOpen] = React.useState(false)
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

  // Kit remove (per-item — simple dialog)
  const [removeDialog, setRemoveDialog] = React.useState<{ open: boolean; kitItem: KitItemRow | null }>({ open: false, kitItem: null })
  const [removeQty, setRemoveQty] = React.useState(1)
  const [removeCondition, setRemoveCondition] = React.useState('GOOD')

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
  const [rentalError, setRentalError] = React.useState('')
  const [addItemOpen, setAddItemOpen] = React.useState(false)
  const [pendingItems, setPendingItems] = React.useState<Map<string, PendingItemEntry>>(new Map())
  const [addItemSourceHubId, setAddItemSourceHubId] = React.useState('')
  const [unitManualQR, setUnitManualQR] = React.useState<Record<string, string>>({})
  const [unitQrLoading, setUnitQrLoading] = React.useState<Record<string, boolean>>({})

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

  React.useEffect(() => {
    load()
    fetch('/api/vehicles').then((r) => r.json()).then((d) => setVehicles(d.data ?? d ?? [])).catch(() => {})
    fetch('/api/inventory?pageSize=200').then((r) => r.json()).then((d) => setInventoryItems(d.data ?? [])).catch(() => {})
    // Operator-readable roster (the full /api/users is admin-only → 403 for
    // operators, which left the transfer destination dropdown empty).
    fetch('/api/operators').then((r) => r.json()).then((d) => {
      setOperators(d.data ?? [])
    }).catch(() => {})
    fetch('/api/hubs').then((r) => r.json()).then((d) => setHubs(d ?? [])).catch(() => {})
  }, [load])

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

  const handleRemoveItem = async () => {
    if (!removeDialog.kitItem || !rig) return
    const result = await mutate({
      endpoint: `/api/deployments/${rig.id}/items/${removeDialog.kitItem.id}`,
      method: 'DELETE',
      body: { quantity: removeQty, returnCondition: removeCondition },
      label: 'Return item',
    })
    if (result.ok && result.queued) {
      showToast({ message: 'Return queued — will sync when online.', severity: 'info' })
      setRemoveDialog({ open: false, kitItem: null })
    } else if (result.ok) {
      showToast({ message: 'Item returned.', severity: 'success' })
      setRemoveDialog({ open: false, kitItem: null })
      await load()
    } else {
      showToast({ message: result.error || 'Could not return the item.', severity: 'error' })
    }
  }

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

  const kitItems = rig?.kits.flatMap((k) => k.items) ?? []
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
        setUnitManualQR({})
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
            sx={{ mb: 1.5, width: '100%', alignItems: 'flex-start' }}
            action={
              <Stack direction="row" spacing={1} sx={{ mt: -0.5 }}>
                <Button size="small" color="error" variant="outlined"
                  onClick={() => { setHandoffRespondDialog({ handoff: h, action: 'decline' }); setHandoffResponseNote('') }}>
                  Decline
                </Button>
                <Button size="small" color="success" variant="contained"
                  onClick={() => { setHandoffRespondDialog({ handoff: h, action: 'accept' }); setHandoffResponseNote('') }}>
                  Accept
                </Button>
              </Stack>
            }
          >
            <Typography variant="body2" fontWeight={600}>
              Deployment Handoff from {h.fromOperatorName}
            </Typography>
            <Typography variant="caption" color="text.secondary">&ldquo;{h.note}&rdquo;</Typography>
          </Alert>
        ))}
        <LocalShippingIcon sx={{ fontSize: 72, color: 'text.disabled', mb: 2 }} />
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
            onClose={() => setNewOpen(false)}
            onSuccess={load}
          />
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
          sx={{ mb: 1.5, alignItems: 'flex-start' }}
          action={
            <Stack direction="row" spacing={1} sx={{ mt: -0.5 }}>
              <Button size="small" color="error" variant="outlined"
                onClick={() => { setHandoffRespondDialog({ handoff: h, action: 'decline' }); setHandoffResponseNote('') }}>
                Decline
              </Button>
              <Button size="small" color="success" variant="contained"
                onClick={() => { setHandoffRespondDialog({ handoff: h, action: 'accept' }); setHandoffResponseNote('') }}>
                Accept
              </Button>
            </Stack>
          }
        >
          <Typography variant="body2" fontWeight={600}>
            Deployment Handoff from {h.fromOperatorName}
          </Typography>
          <Typography variant="caption" color="text.secondary">&ldquo;{h.note}&rdquo;</Typography>
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
            sx={{ mb: 1.5, alignItems: 'flex-start' }}
            action={
              <Stack direction="row" spacing={1} sx={{ mt: -0.5 }}>
                <Button size="small" color="error" variant="outlined"
                  onClick={() => { setRespondDialog({ transfer: tr, action: 'decline' }); setResponseNote('') }}>
                  Decline
                </Button>
                <Button size="small" color="success" variant="contained"
                  onClick={() => { setRespondDialog({ transfer: tr, action: 'accept' }); setResponseNote('') }}>
                  Accept
                </Button>
              </Stack>
            }
          >
            <Typography variant="body2" fontWeight={600}>
              Incoming Transfer from {tr.fromRig.operator.name}
            </Typography>
            <Typography variant="body2">{summary}</Typography>
            <Typography variant="caption" color="text.secondary">&ldquo;{tr.note}&rdquo;</Typography>
          </Alert>
        )
      })}

      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5">My Deployment</Typography>
          <Stack direction="row" spacing={1} mt={0.5} alignItems="center">
            {rig.project && <Chip size="small" label={rig.project.name} color="primary" />}
            <Typography variant="body2" color="text.secondary">
              Started {new Date(rig.startedAt).toLocaleDateString()}
            </Typography>
          </Stack>
        </Box>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={2}>
        {/* Vehicles card */}
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={1.5}>Vehicles</Typography>
            {rig.vehicles.length === 0 ? (
              <Typography variant="body2" color="text.secondary" mb={1}>No vehicles.</Typography>
            ) : (
              <Stack spacing={0.5} mb={1}>
                {rig.vehicles.map((rv) => {
                  const Icon = VEHICLE_ICON[rv.vehicle.type] ?? LocalShippingIcon
                  return (
                    <Stack key={rv.id} direction="row" alignItems="center" spacing={1}>
                      {removingVehicles && (
                        <Checkbox size="small" checked={selVehicles.has(rv.vehicle.id)}
                          onChange={(e) => {
                            const s = new Set(selVehicles)
                            e.target.checked ? s.add(rv.vehicle.id) : s.delete(rv.vehicle.id)
                            setSelVehicles(s)
                          }} />
                      )}
                      <Icon fontSize="small" color="action" />
                      <Typography variant="body2">{rv.vehicle.name}</Typography>
                      {rv.vehicle.isRental && (
                        <Chip label="Rental" size="small" color="warning" variant="outlined" sx={{ ml: 0.5, height: 18, fontSize: 10 }} />
                      )}
                    </Stack>
                  )
                })}
              </Stack>
            )}
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" startIcon={<AddIcon />}
                onClick={() => setAddVehicleOpen(true)}>
                Add Vehicles
              </Button>
              {rig.vehicles.length > 0 && !removingVehicles && (
                <Button size="small" variant="outlined" color="error"
                  onClick={() => setRemovingVehicles(true)}>
                  Remove Vehicles
                </Button>
              )}
              {removingVehicles && selVehicles.size > 0 && (
                <Button size="small" variant="contained" color="error"
                  onClick={() => setNoteDialog('removeVehicles')}>
                  Remove Selected ({selVehicles.size})
                </Button>
              )}
              {removingVehicles && (
                <Button size="small" onClick={() => { setRemovingVehicles(false); setSelVehicles(new Set()) }}>
                  Cancel
                </Button>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* My Kit Card */}
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={1.5}>My Kit</Typography>
            {kitItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary" mb={1}>Empty kit.</Typography>
            ) : (
              <Stack spacing={0.5} mb={1}>
                {kitItems.map((ki) => {
                  const isLow = ki.item.lowStockThreshold != null && ki.quantity <= ki.item.lowStockThreshold
                  return (
                    <Stack key={ki.id} direction="row" alignItems="center" spacing={1}>
                      {removingItems && (
                        <Checkbox size="small" checked={selItems.has(ki.id)}
                          onChange={(e) => {
                            const s = new Set(selItems)
                            e.target.checked ? s.add(ki.id) : s.delete(ki.id)
                            setSelItems(s)
                          }} />
                      )}
                      <Box flexGrow={1}>
                        <Typography variant="body2">{ki.item.name}</Typography>
                        {ki.inventoryUnit && (
                          <Typography variant="caption" color="text.secondary">
                            Unit: {ki.inventoryUnit.serialNumber ?? ki.inventoryUnit.qrCodeId.slice(0, 8)}
                          </Typography>
                        )}
                      </Box>
                      <Chip size="small" label={ki.item.categoryRef?.name ?? ki.item.itemType} sx={{ height: 18, fontSize: 10 }} />
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        {isLow && <WarningAmberIcon fontSize="small" color="warning" />}
                        <Chip size="small" label={`×${ki.quantity}`}
                          color={isLow ? 'warning' : 'default'} />
                      </Stack>
                      {!removingItems && ki.item.itemType === 'CONSUMABLE' && (
                        <Tooltip title="Log daily usage">
                          <IconButton size="small" color="warning"
                            onClick={() => {
                              setLogUsageDialog({ open: true, kitItem: ki })
                              setLogUsageQty(1)
                            }}>
                            <RemoveCircleOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {!removingItems && ki.item.itemType !== 'CONSUMABLE' && (
                        <Tooltip title="Return item">
                          <IconButton size="small" color="error"
                            onClick={() => {
                              setRemoveDialog({ open: true, kitItem: ki })
                              setRemoveQty(ki.quantity)
                              setRemoveCondition('GOOD')
                            }}>
                            <RemoveCircleOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  )
                })}
              </Stack>
            )}
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" startIcon={<AddIcon />}
                onClick={() => { setAddItemOpen(true); if (!addItemSourceHubId) setAddItemSourceHubId((user?.homeHubId && hubs.some((h) => h.id === user.homeHubId) ? user.homeHubId : hubs[0]?.id) ?? '') }}>
                Add Items
              </Button>
              {kitItems.length > 0 && !removingItems && (
                <Button size="small" variant="outlined" color="error"
                  onClick={() => setRemovingItems(true)}>
                  Remove Items
                </Button>
              )}
              {removingItems && selItems.size > 0 && (
                <Button size="small" variant="contained" color="error"
                  onClick={() => setNoteDialog('removeItems')}>
                  Remove Selected ({selItems.size})
                </Button>
              )}
              {removingItems && (
                <Button size="small" onClick={() => { setRemovingItems(false); setSelItems(new Set()) }}>
                  Cancel
                </Button>
              )}
            </Stack>
          </CardContent>
        </Card>
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

      {/* Action row */}
      <Stack direction="row" spacing={2} alignItems="center">
        <Button variant="outlined" fullWidth startIcon={<SwapHorizIcon />}
          onClick={() => setTransferOpen(true)}>
          Transfer Equipment
        </Button>
        <Button variant="outlined" fullWidth startIcon={<GroupIcon />}
          onClick={() => { setHandoffOpen(true); setHandoffTargetId(''); setHandoffNote('') }}>
          Hand Off Deployment
        </Button>
        <Button variant="text" color="error" startIcon={<StopCircleIcon />}
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
                    VEHICLE_TYPE_ORDER,
                  ).map(({ group, items: gv }) => (
                    <React.Fragment key={group}>
                      <ListSubheader sx={{ lineHeight: '32px', bgcolor: 'background.default' }}>
                        {group.replace(/_/g, ' ')}
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
              disabled={rentalSubmitLoading || !rentalFields.name || !rentalFields.type}
              startIcon={rentalSubmitLoading ? <CircularProgress size={16} color="inherit" /> : null}
              onClick={async () => {
                if (!rig) return
                setRentalError('')
                setRentalSubmitLoading(true)
                try {
                  const payload = {
                    isRental: true,
                    name: rentalFields.name,
                    type: rentalFields.type,
                    rentalMake: rentalFields.rentalMake || undefined,
                    rentalModel: rentalFields.rentalModel || undefined,
                    rentalYear: rentalFields.rentalYear ? parseInt(rentalFields.rentalYear) : undefined,
                    rentalLength: rentalFields.rentalLength || undefined,
                    rentalAgreementUrl: rentalFields.rentalAgreementUrl || undefined,
                    rentalPickupLocation: rentalFields.rentalPickupLocation || undefined,
                    rentalDropoffLocation: rentalFields.rentalDropoffLocation || undefined,
                  }
                  const vRes = await fetch('/api/vehicles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  })
                  const vJson = await vRes.json()
                  if (!vRes.ok) { setRentalError(vJson.error?.formErrors?.[0] ?? vJson.error ?? 'Failed to create vehicle'); return }
                  const vehicleId: string = vJson.data.id
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
                } finally {
                  setRentalSubmitLoading(false)
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
      <Dialog open={addItemOpen} onClose={() => { setAddItemOpen(false); setPendingItems(new Map()); setUnitManualQR({}); setAddItemSourceHubId('') }} maxWidth="sm" fullWidth>
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

                const handleQRScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setUnitQrLoading((p) => ({ ...p, [item.id]: true }))
                  try {
                    const bitmap = await createImageBitmap(file)
                    const canvas = document.createElement('canvas')
                    canvas.width = bitmap.width; canvas.height = bitmap.height
                    const ctx = canvas.getContext('2d')!
                    ctx.drawImage(bitmap, 0, 0)
                    const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
                    const jsQR = (await import('jsqr')).default
                    const result = jsQR(imgData.data, bitmap.width, bitmap.height)
                    if (result?.data) {
                      const res = await fetch(`/api/inventory/units/by-qr/${encodeURIComponent(result.data)}`)
                      if (res.ok) {
                        const json = await res.json()
                        if (json.unit?.inventoryItemId === item.id && json.unit?.status === 'AVAILABLE') {
                          const m = new Map(pendingItems)
                          m.set(item.id, { itemType: 'SERIALIZED', quantity: 1, inventoryUnitId: json.unit.id, unitLabel: json.unit.serialNumber ?? `Unit ${json.unit.position}` })
                          setPendingItems(m)
                        }
                      }
                    }
                  } finally {
                    setUnitQrLoading((p) => ({ ...p, [item.id]: false }))
                    e.target.value = ''
                  }
                }

                const lookupManualQR = async () => {
                  const qr = unitManualQR[item.id]?.trim()
                  if (!qr) return
                  setUnitQrLoading((p) => ({ ...p, [item.id]: true }))
                  try {
                    const res = await fetch(`/api/inventory/units/by-qr/${encodeURIComponent(qr)}`)
                    if (res.ok) {
                      const json = await res.json()
                      if (json.unit?.inventoryItemId === item.id && json.unit?.status === 'AVAILABLE') {
                        const m = new Map(pendingItems)
                        m.set(item.id, { itemType: 'SERIALIZED', quantity: 1, inventoryUnitId: json.unit.id, unitLabel: json.unit.serialNumber ?? `Unit ${json.unit.position}` })
                        setPendingItems(m)
                      }
                    }
                  } finally {
                    setUnitQrLoading((p) => ({ ...p, [item.id]: false }))
                  }
                }

                const addHubAvail = !isSerialized
                  ? (addItemSourceHubId
                      ? (item.hubStock?.find((s) => s.hubId === addItemSourceHubId)?.available ?? (item.availableQuantity ?? 0))
                      : (item.availableQuantity ?? 0))
                  : 0
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
                          helperText={`${addHubAvail} avail.`}
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
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Button component="label" size="small" variant="outlined" startIcon={<QrCodeScannerIcon />}
                                disabled={!!unitQrLoading[item.id]}>
                                Scan QR
                                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                                  onChange={handleQRScan} />
                              </Button>
                              <TextField size="small" placeholder="Enter QR code" value={unitManualQR[item.id] ?? ''}
                                onChange={(e) => setUnitManualQR((p) => ({ ...p, [item.id]: e.target.value }))}
                                sx={{ width: 160 }} />
                              <Button size="small" onClick={lookupManualQR} disabled={!unitManualQR[item.id]?.trim() || !!unitQrLoading[item.id]}>
                                Look Up
                              </Button>
                            </Stack>
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
          <Button onClick={() => { setAddItemOpen(false); setPendingItems(new Map()); setUnitManualQR({}); setAddItemSourceHubId('') }}>Cancel</Button>
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
        loading={actionLoading}
        onClose={() => setNoteDialog(null)}
        onConfirm={(note, photoUrls) => doAction('addVehicles', note, photoUrls)}
        confirmLabel="Add Vehicles"
      />
      <NotePhotoDialog
        open={noteDialog === 'removeVehicles'}
        title={`Remove ${selVehicles.size} vehicle(s)`}
        loading={actionLoading}
        onClose={() => setNoteDialog(null)}
        onConfirm={(note, photoUrls) => doAction('removeVehicles', note, photoUrls)}
        confirmLabel="Remove"
        confirmColor="error"
      />
      <NotePhotoDialog
        open={noteDialog === 'addItems'}
        title="Add items to kit"
        loading={actionLoading}
        onClose={() => setNoteDialog(null)}
        onConfirm={(note, photoUrls) => doAction('addItems', note, photoUrls)}
        confirmLabel="Add Items"
      />
      {/* Per-item return dialog */}
      <Dialog open={removeDialog.open} onClose={() => setRemoveDialog({ open: false, kitItem: null })} maxWidth="xs" fullWidth>
        <DialogTitle>Return Item</DialogTitle>
        <DialogContent>
          <Typography mb={2}>
            Returning <strong>{removeDialog.kitItem?.item.name}</strong>
            {removeDialog.kitItem?.inventoryUnit && ` (Unit: ${removeDialog.kitItem.inventoryUnit.serialNumber ?? removeDialog.kitItem.inventoryUnit.qrCodeId.slice(0, 8)})`}
          </Typography>
          {removeDialog.kitItem?.item.itemType === 'CONSUMABLE' && (
            <TextField
              type="number"
              label="Quantity to return"
              value={removeQty}
              onChange={(e) => setRemoveQty(Math.max(1, Math.min(parseInt(e.target.value) || 1, removeDialog.kitItem?.quantity ?? 1)))}
              inputProps={{ min: 1, max: removeDialog.kitItem?.quantity ?? 1 }}
              fullWidth
              sx={{ mb: 2 }}
            />
          )}
          <TextField select label="Condition" value={removeCondition} onChange={(e) => setRemoveCondition(e.target.value)} fullWidth>
            <MenuItem value="GOOD">Good</MenuItem>
            <MenuItem value="IN_MAINTENANCE">Needs Maintenance</MenuItem>
            <MenuItem value="INOPERABLE">Inoperable</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRemoveDialog({ open: false, kitItem: null })}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleRemoveItem}>Return</Button>
        </DialogActions>
      </Dialog>

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
      {noteDialog === 'end' && (
        <DispositionDialog
          open={true}
          mode="end-deployment"
          deploymentId={rig.id}
          currentOperatorId={rig.operator.id}
          operators={operators}
          hubs={hubs}
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
          <TextField
            select label="Hand off to" value={handoffTargetId}
            onChange={(e) => setHandoffTargetId(e.target.value)} fullWidth sx={{ mb: 2 }}
          >
            {operators.filter((o) => o.id !== rig.operator.id).map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
            ))}
          </TextField>
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
