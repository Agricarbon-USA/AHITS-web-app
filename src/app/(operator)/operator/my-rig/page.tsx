'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Stack, Card, CardContent,
  Chip, CircularProgress, Checkbox, TextField, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, List,
  ListItem, ListItemText, ListItemIcon, Stepper, Step, StepLabel,
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
import { NotePhotoDialog } from '@/components/shared/NotePhotoDialog'
import { DispositionDialog, KitItemSummary } from '@/components/shared/DispositionDialog'
import { RentalVehicleForm, RentalVehicleFields } from '@/components/shared/RentalVehicleForm'
import { useToast } from '@/components/shared/useToast'

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
  category: string
  unitCounts: {
    available: number
    checkedOut: number
    inMaintenance: number
    inoperable: number
    totalUnits: number
  }
  availableUnits: Array<{ id: string; serialNumber: string | null; qrCodeId: string; position: number }>
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
  items: { id: string; kitItem: { id: string; quantity: number; item: { id: string; name: string } } }[]
}

// ── Transfer Dialog ───────────────────────────────────────────────

function TransferDialog({
  rig,
  operators,
  onClose,
  onSuccess,
  showToast,
}: {
  rig: Rig
  operators: UserOption[]
  onClose: () => void
  onSuccess: () => void
  showToast: (t: { message: string; severity: 'success' | 'error' | 'warning' | 'info' }) => void
}) {
  const [step, setStep] = React.useState(0)
  const [toOperatorId, setToOperatorId] = React.useState('')
  const [selVehicles, setSelVehicles] = React.useState<Set<string>>(
    new Set(rig.vehicles.map((rv) => rv.vehicle.id))
  )
  const kitItems = rig.kits.flatMap((k) => k.items)
  const [selKitItems, setSelKitItems] = React.useState<Set<string>>(
    new Set(kitItems.map((ki) => ki.id))
  )
  const [transferQtys, setTransferQtys] = React.useState<Map<string, number>>(
    new Map(kitItems.map((ki) => [ki.id, ki.quantity]))
  )
  const [loading, setLoading] = React.useState(false)

  const doTransfer = async (note: string, photoUrls: string[]) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/deployments/${rig.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toOperatorId,
          note,
          photoUrls,
          vehicleIds: Array.from(selVehicles),
          items: kitItems
            .filter((ki) => selKitItems.has(ki.id))
            .map((ki) => ({
              kitItemId: ki.id,
              quantity: transferQtys.get(ki.id) ?? ki.quantity,
              inventoryUnitId: ki.inventoryUnit?.id ?? undefined,
            })),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Transfer failed. Please try again.', severity: 'error' })
        return
      }
      const destName = operators.find((o) => o.id === toOperatorId)?.name ?? 'operator'
      showToast({ message: `Transfer request sent — waiting for ${destName} to accept.`, severity: 'success' })
      onSuccess()
      onClose()
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    } finally {
      setLoading(false)
    }
  }

  if (step === 2) {
    return (
      <NotePhotoDialog
        title="Transfer equipment"
        description={`Transferring to ${operators.find((o) => o.id === toOperatorId)?.name ?? 'operator'}`}
        open={true}
        loading={loading}
        onClose={onClose}
        onConfirm={doTransfer}
        confirmLabel="Transfer"
      />
    )
  }

  return (
    <Dialog open={true} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Transfer Equipment</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 3, mt: 1 }}>
          <Step><StepLabel>Destination</StepLabel></Step>
          <Step><StepLabel>Select Items</StepLabel></Step>
          <Step><StepLabel>Note</StepLabel></Step>
        </Stepper>

        {step === 0 && (
          <TextField select label="Destination Operator" value={toOperatorId}
            onChange={(e) => setToOperatorId(e.target.value)} fullWidth>
            {operators.map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
            ))}
          </TextField>
        )}

        {step === 1 && (
          <Stack spacing={2}>
            {rig.vehicles.length > 0 && (
              <Box>
                <Typography variant="subtitle2" fontWeight={600} mb={1}>Vehicles</Typography>
                {rig.vehicles.map((rv) => {
                  const Icon = VEHICLE_ICON[rv.vehicle.type] ?? LocalShippingIcon
                  return (
                    <Stack key={rv.vehicle.id} direction="row" alignItems="center" spacing={1}>
                      <Checkbox size="small" checked={selVehicles.has(rv.vehicle.id)}
                        onChange={(e) => {
                          const s = new Set(selVehicles)
                          e.target.checked ? s.add(rv.vehicle.id) : s.delete(rv.vehicle.id)
                          setSelVehicles(s)
                        }} />
                      <Icon fontSize="small" color="action" />
                      <Typography variant="body2">{rv.vehicle.name}</Typography>
                    </Stack>
                  )
                })}
              </Box>
            )}
            {kitItems.length > 0 && (
              <Box>
                <Typography variant="subtitle2" fontWeight={600} mb={1}>Kit Items</Typography>
                <Stack spacing={0.5}>
                  {kitItems.map((ki) => (
                    <Stack key={ki.id} direction="row" alignItems="center" spacing={1}>
                      <Checkbox size="small" checked={selKitItems.has(ki.id)}
                        onChange={(e) => {
                          const s = new Set(selKitItems)
                          e.target.checked ? s.add(ki.id) : s.delete(ki.id)
                          setSelKitItems(s)
                        }} />
                      <Box flexGrow={1}>
                        <Typography variant="body2">{ki.item.name}</Typography>
                        {ki.inventoryUnit && (
                          <Typography variant="caption" color="text.secondary">
                            {ki.inventoryUnit.serialNumber ?? ki.inventoryUnit.qrCodeId.slice(0, 8)}
                          </Typography>
                        )}
                      </Box>
                      {ki.item.itemType === 'CONSUMABLE' && selKitItems.has(ki.id) ? (
                        <TextField
                          type="number"
                          size="small"
                          value={transferQtys.get(ki.id) ?? ki.quantity}
                          onChange={(e) => {
                            const qty = Math.max(1, Math.min(parseInt(e.target.value) || 1, ki.quantity))
                            const m = new Map(transferQtys)
                            m.set(ki.id, qty)
                            setTransferQtys(m)
                          }}
                          inputProps={{ min: 1, max: ki.quantity }}
                          sx={{ width: 70 }}
                        />
                      ) : (
                        <Typography variant="caption" color="text.secondary">×{ki.quantity}</Typography>
                      )}
                    </Stack>
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        {step > 0 && <Button onClick={() => setStep((s) => s - 1)}>Back</Button>}
        <Button variant="contained" onClick={() => setStep((s) => s + 1)}
          disabled={step === 0 && !toOperatorId}>
          {step < 1 ? 'Next' : 'Continue to Note'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── New Deployment Dialog (operator) ──────────────────────────────

function NewDeploymentDialog({
  vehicles,
  inventoryItems,
  operators,
  onClose,
  onSuccess,
}: {
  vehicles: VehicleOption[]
  inventoryItems: InventoryOption[]
  operators: UserOption[]
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

  const unassignedVehicles = vehicles.filter((v) => !v.assignedOperatorId && v.status === 'ACTIVE')
  const availableItems = inventoryItems.filter((i) => (i.unitCounts?.available ?? 0) > 0)

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

  const launch = async () => {
    if (!note.trim()) { setError('Note is required'); return }
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
              <List dense>
                {unassignedVehicles.map((v) => {
                  const Icon = VEHICLE_ICON[v.type] ?? LocalShippingIcon
                  return (
                    <ListItem key={v.id} disablePadding>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Checkbox size="small" checked={selVehicles.has(v.id)}
                          onChange={(e) => {
                            const s = new Set(selVehicles)
                            e.target.checked ? s.add(v.id) : s.delete(v.id)
                            setSelVehicles(s)
                          }} />
                      </ListItemIcon>
                      <ListItemIcon sx={{ minWidth: 32 }}><Icon fontSize="small" /></ListItemIcon>
                      <ListItemText primary={v.name} secondary={v.type} />
                    </ListItem>
                  )
                })}
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
              <Stack spacing={1}>
                {availableItems.map((item) => {
                  const isSerialized = item.itemType === 'SERIALIZED'
                  const entry = kitItems.get(item.id)
                  const checked = !!entry
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
                          <Chip size="small" label={item.category} sx={{ height: 16, fontSize: 10 }} />
                        </Box>
                        {checked && !isSerialized && (
                          <TextField
                            type="number"
                            size="small"
                            value={entry?.quantity ?? 1}
                            onChange={(e) => {
                              const m = new Map(kitItems)
                              const v = Math.min(parseInt(e.target.value) || 1, item.unitCounts?.available ?? 1)
                              m.set(item.id, { itemType: 'CONSUMABLE', quantity: v, inventoryUnitId: null, unitLabel: null })
                              setKitItems(m)
                            }}
                            inputProps={{ min: 1, max: item.unitCounts?.available ?? 1, style: { MozAppearance: 'textfield', width: 60 } }}
                            helperText={`${item.unitCounts?.available ?? 0} avail.`}
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
          <Button variant="contained" onClick={launch} disabled={!note.trim() || loading || hasUnselectedSerialized}
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
  const [unitManualQR, setUnitManualQR] = React.useState<Record<string, string>>({})
  const [unitQrLoading, setUnitQrLoading] = React.useState<Record<string, boolean>>({})

  type NoteAction = 'addVehicles' | 'removeVehicles' | 'addItems' | 'removeItems' | 'end'
  const [noteDialog, setNoteDialog] = React.useState<NoteAction | null>(null)
  const [actionLoading, setActionLoading] = React.useState(false)


  const loadTransfers = React.useCallback(async () => {
    const [inRes, outRes] = await Promise.all([
      fetch('/api/transfers?status=PENDING&direction=incoming'),
      fetch('/api/transfers?status=PENDING&direction=outgoing'),
    ])
    if (inRes.ok) setIncomingTransfers(await inRes.json())
    if (outRes.ok) setOutgoingTransfers(await outRes.json())
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
    fetch('/api/users').then((r) => r.json()).then((d) => {
      setOperators((d.data ?? []).filter((u: UserOption) => u.role === 'OPERATOR'))
    }).catch(() => {})
    fetch('/api/hubs').then((r) => r.json()).then((d) => setHubs(d ?? [])).catch(() => {})
  }, [load])

  const handleRespond = async () => {
    if (!respondDialog) return
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

  const handleRemoveItem = async () => {
    if (!removeDialog.kitItem || !rig) return
    try {
      const res = await fetch(`/api/deployments/${rig.id}/items/${removeDialog.kitItem.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: removeQty, returnCondition: removeCondition }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Could not return the item.', severity: 'error' })
        return
      }
      showToast({ message: 'Item returned.', severity: 'success' })
      setRemoveDialog({ open: false, kitItem: null })
      await load()
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    }
  }

  const handleLogUsage = async () => {
    if (!logUsageDialog.kitItem || !rig) return
    setLogUsageLoading(true)
    try {
      const res = await fetch(`/api/deployments/${rig.id}/items/${logUsageDialog.kitItem.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: logUsageQty,
          returnCondition: 'GOOD',
          notes: `Daily usage log — ${logUsageQty} used`,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Could not log usage.', severity: 'error' })
        return
      }
      showToast({ message: 'Usage logged.', severity: 'success' })
      setLogUsageDialog({ open: false, kitItem: null })
      await load()
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    } finally {
      setLogUsageLoading(false)
    }
  }

  const kitItems = rig?.kits.flatMap((k) => k.items) ?? []
  const unassignedVehicles = vehicles.filter((v) => !v.assignedOperatorId && v.status === 'ACTIVE')

  const doAction = async (action: NoteAction, note: string, photoUrls: string[]) => {
    if (!rig) return
    setActionLoading(true)
    switch (action) {
      case 'addVehicles':
        await fetch(`/api/deployments/${rig.id}/vehicles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleIds: Array.from(pendingVehicles), note, photoUrls }),
        })
        setPendingVehicles(new Set())
        setAddVehicleOpen(false)
        break
      case 'removeVehicles':
        await fetch(`/api/deployments/${rig.id}/vehicles`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleIds: Array.from(selVehicles), note, photoUrls }),
        })
        setSelVehicles(new Set())
        setRemovingVehicles(false)
        break
      case 'addItems': {
        const addRes = await fetch(`/api/deployments/${rig.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: Array.from(pendingItems.entries()).map(([inventoryItemId, entry]) =>
              entry.itemType === 'SERIALIZED'
                ? { itemType: 'SERIALIZED', inventoryItemId, inventoryUnitId: entry.inventoryUnitId! }
                : { itemType: 'CONSUMABLE', inventoryItemId, quantity: entry.quantity }
            ),
            note,
            photoUrls,
          }),
        })
        if (addRes.status === 409) {
          const err = await addRes.json()
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
          showToast({ message: err.error ?? 'A unit was just taken. Please reselect.', severity: 'warning' })
          return
        }
        setPendingItems(new Map())
        setUnitManualQR({})
        setAddItemOpen(false)
        break
      }
      case 'end':
        await fetch(`/api/deployments/${rig.id}/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note }),
        })
        break
    }
    setActionLoading(false)
    setNoteDialog(null)
    await load()
  }

  if (rig === undefined) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress /></Box>
  }

  if (!rig) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 10 }}>
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
            onClose={() => setNewOpen(false)}
            onSuccess={load}
          />
        )}
      </Box>
    )
  }

  return (
    <Box>
      {/* Incoming transfer banners */}
      {incomingTransfers.map((tr) => {
        const vehicleNames = tr.vehicles.map((tv) => tv.vehicle.name).join(', ')
        const itemNames = tr.items.map((ti) => `${ti.kitItem.item.name} ×${ti.kitItem.quantity}`).join(', ')
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
          <Typography variant="h5">My Rig</Typography>
          <Stack direction="row" spacing={1} mt={0.5} alignItems="center">
            {rig.project && <Chip size="small" label={rig.project.name} color="primary" />}
            <Typography variant="body2" color="text.secondary">
              Started {new Date(rig.startedAt).toLocaleDateString()}
            </Typography>
          </Stack>
        </Box>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={2}>
        {/* My Rig Card */}
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={1.5}>My Rig</Typography>
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
                onClick={() => setAddItemOpen(true)}>
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
        const itemNames = tr.items.map((ti) => ti.kitItem.item.name).join(', ')
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

      {/* Action row */}
      <Stack direction="row" spacing={2} alignItems="center">
        <Button variant="outlined" fullWidth startIcon={<SwapHorizIcon />}
          onClick={() => setTransferOpen(true)}>
          Transfer Equipment
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
                <List dense>
                  {unassignedVehicles.map((v) => {
                    const Icon = VEHICLE_ICON[v.type] ?? LocalShippingIcon
                    return (
                      <ListItem key={v.id} disablePadding>
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <Checkbox size="small" checked={pendingVehicles.has(v.id)}
                            onChange={(e) => {
                              const s = new Set(pendingVehicles)
                              e.target.checked ? s.add(v.id) : s.delete(v.id)
                              setPendingVehicles(s)
                            }} />
                        </ListItemIcon>
                        <ListItemIcon sx={{ minWidth: 32 }}><Icon fontSize="small" /></ListItemIcon>
                        <ListItemText primary={v.name} secondary={v.type} />
                      </ListItem>
                    )
                  })}
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
                  await fetch(`/api/deployments/${rig.id}/vehicles`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vehicleIds: [vehicleId], note: 'Added rental vehicle', photoUrls: [] }),
                  })
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
      <Dialog open={addItemOpen} onClose={() => { setAddItemOpen(false); setPendingItems(new Map()); setUnitManualQR({}) }} maxWidth="sm" fullWidth>
        <DialogTitle>Add Items</DialogTitle>
        <DialogContent>
          {inventoryItems.filter((i) => (i.unitCounts?.available ?? 0) > 0).length === 0 ? (
            <Typography variant="body2" color="text.secondary">No available items.</Typography>
          ) : (
            <Stack spacing={1.5} mt={1}>
              {inventoryItems.filter((i) => (i.unitCounts?.available ?? 0) > 0).map((item) => {
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
                        <Chip size="small" label={item.category} sx={{ height: 16, fontSize: 10 }} />
                      </Box>
                      {checked && !isSerialized && (
                        <TextField
                          type="number"
                          size="small"
                          value={entry?.quantity ?? 1}
                          onChange={(e) => {
                            const m = new Map(pendingItems)
                            const v = Math.min(parseInt(e.target.value) || 1, item.unitCounts?.available ?? 1)
                            m.set(item.id, { itemType: 'CONSUMABLE', quantity: v, inventoryUnitId: null, unitLabel: null })
                            setPendingItems(m)
                          }}
                          inputProps={{ min: 1, max: item.unitCounts?.available ?? 1, style: { MozAppearance: 'textfield', width: 60 } }}
                          helperText={`${item.unitCounts?.available ?? 0} avail.`}
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
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setAddItemOpen(false); setPendingItems(new Map()); setUnitManualQR({}) }}>Cancel</Button>
          <Button variant="contained"
            disabled={pendingItems.size === 0 || Array.from(pendingItems.values()).some(e => e.itemType === 'SERIALIZED' && !e.inventoryUnitId)}
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
    </Box>
  )
}
