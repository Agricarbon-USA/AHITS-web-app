'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Stack, Alert, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Skeleton, MenuItem, TextField, Switch, FormControlLabel,
  Drawer, Divider, Avatar, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, CircularProgress, Checkbox, List, ListItem,
  ListItemText, ListItemIcon, Stepper, Step, StepLabel,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import TerrainIcon from '@mui/icons-material/Terrain'
import AgricultureIcon from '@mui/icons-material/Agriculture'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import StopCircleIcon from '@mui/icons-material/StopCircle'
import CloseIcon from '@mui/icons-material/Close'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import { NotePhotoDialog } from '@/components/shared/NotePhotoDialog'
import { TransferDialog } from '@/components/shared/TransferDialog'
import { KitItemSelectRow } from '@/components/admin/KitItemSelectRow'
import { DispositionDialog } from '@/components/shared/DispositionDialog'
import type { HubOption, UserOption } from '@/components/shared/DispositionDialog'
import { useCanEdit, EditGuard, MutationButton, MutationIconButton } from '@/components/shared/ReadOnly'
import { ConditionSelect } from '@/components/shared/ConditionSelect'
import { useToast } from '@/components/shared/useToast'
import {
  RentalVehicleForm, rentalFieldsToVehiclePayload, isRentalFormValid,
  type RentalVehicleFields,
} from '@/components/shared/RentalVehicleForm'
import type { ReturnCondition } from '@/lib/status'

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
  addNote: string
  photoUrls: string[]
  addedAt: string
  vehicle: { id: string; name: string; type: string; isRental?: boolean; rentalAgreementUrl?: string | null }
}

interface KitItemRow {
  id: string
  quantity: number
  item: { id: string; name: string; itemType: string; categoryRef: { name: string } | null }
  inventoryUnit: { id: string; serialNumber: string | null; qrCodeId: string; status: string } | null
}

interface KitRow {
  id: string
  items: KitItemRow[]
}

interface SecondaryOperatorRow {
  id: string
  operatorId: string
  operator: { id: string; name: string; email: string }
}

interface Rig {
  id: string
  label: string | null
  startedAt: string
  endedAt: string | null
  operator: { id: string; name: string }
  project: { id: string; name: string } | null
  vehicles: RigVehicleRow[]
  kits: KitRow[]
  secondaryOperators: SecondaryOperatorRow[]
}

interface VehicleOption {
  id: string
  name: string
  type: string
  status: string
  assignedOperatorId: string | null
}

interface InventoryOption {
  id: string
  name: string
  itemType: 'CONSUMABLE' | 'SERIALIZED'
  quantity: number
  unitCounts: { available: number; checkedOut: number; inMaintenance: number; inoperable: number; retired: number; totalUnits: number }
  availableUnits: { id: string; serialNumber: string | null; position: number }[]
  category: { id: string; name: string }
}

type AdminKitEntry =
  | { inventoryItemId: string; itemType: 'CONSUMABLE'; quantity: number }
  | { inventoryItemId: string; itemType: 'SERIALIZED'; inventoryUnitId: string; unitLabel: string }

interface TransferRow {
  id: string
  note: string
  createdAt: string
  status: string
  fromRig: { id: string; operator: { id: string; name: string } }
  toOperator: { id: string; name: string }
  vehicles: { id: string; vehicle: { id: string; name: string; type: string } }[]
  items: { id: string; kitItem: { id: string; quantity: number; item: { id: string; name: string } } }[]
}

// ── Helpers ───────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
}

function relativeDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

// Transfer Dialog now lives in components/shared/TransferDialog.tsx (UX-5).
// ── New Deployment Dialog ─────────────────────────────────────────

function NewDeploymentDialog({
  operators, vehicles, inventoryItems, hubs, onClose, onSuccess,
}: {
  operators: UserOption[]
  vehicles: VehicleOption[]
  inventoryItems: InventoryOption[]
  hubs: HubOption[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [step, setStep] = React.useState(0)
  const [operatorId, setOperatorId] = React.useState('')
  const [projectId] = React.useState('')
  const [label, setLabel] = React.useState('')
  const [selVehicles, setSelVehicles] = React.useState<Set<string>>(new Set())
  const [kitItems, setKitItems] = React.useState<Map<string, AdminKitEntry>>(new Map())
  // NEW-4: consumables must be drawn from a specific hub; without a sourceHubId the
  // create fails on the consumable draw. Mirror the operator flow: require a hub
  // when the kit contains any consumable.
  const [sourceHubId, setSourceHubId] = React.useState('')
  const [note, setNote] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  const unassignedVehicles = vehicles.filter((v) => !v.assignedOperatorId && v.status !== 'RETIRED')
  // Consumables show when quantity > 0; serialized show when at least one unit is available
  const availableItems = inventoryItems.filter((i) =>
    i.itemType === 'SERIALIZED' ? i.unitCounts.available > 0 : i.quantity > 0
  )
  const hasConsumableInKit = Array.from(kitItems.values()).some((e) => e.itemType === 'CONSUMABLE')
  // Block launch when a consumable is packed but no source hub is chosen.
  const hasUnresolved = hasConsumableInKit && !sourceHubId

  const launch = async () => {
    if (!note.trim()) { setError('A deployment note is required.'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/deployments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operatorId, projectId: projectId || undefined, label: label || undefined, note,
        sourceHubId: sourceHubId || undefined,
        vehicleIds: Array.from(selVehicles),
        kitItems: Array.from(kitItems.values()).map((entry) =>
          entry.itemType === 'SERIALIZED'
            ? { inventoryItemId: entry.inventoryItemId, inventoryUnitId: entry.inventoryUnitId, itemType: 'SERIALIZED' }
            : { inventoryItemId: entry.inventoryItemId, quantity: entry.quantity }
        ),
      }),
    })
    setLoading(false)
    if (res.ok) { onSuccess(); onClose() }
    else {
      let errMsg = 'Failed to launch. Please try again.'
      try {
        const d = await res.json()
        if (res.status === 409) {
          // Remove all serialized entries so user can reselect
          const m = new Map(kitItems)
          for (const [key, entry] of m) { if (entry.itemType === 'SERIALIZED') m.delete(key) }
          setKitItems(m)
        }
        if (typeof d.error === 'string') errMsg = d.error
        else if (Array.isArray(d.error?.formErrors) && d.error.formErrors.length > 0) errMsg = d.error.formErrors[0]
      } catch {
        // Non-JSON error body — show generic message above
      }
      setError(errMsg)
    }
  }

  return (
    <Dialog open={true} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New Deployment</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 3, mt: 1 }}>
          <Step><StepLabel>Assign</StepLabel></Step>
          <Step><StepLabel>Build Rig</StepLabel></Step>
          <Step><StepLabel>Build Kit</StepLabel></Step>
          <Step><StepLabel>Launch</StepLabel></Step>
        </Stepper>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {step === 0 && (
          <Stack spacing={2}>
            <TextField select label="Operator" value={operatorId} onChange={(e) => setOperatorId(e.target.value)} fullWidth required>
              {operators.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
            </TextField>
            <TextField label="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth placeholder="e.g. TX Summer Run" />
          </Stack>
        )}
        {step === 1 && (
          <Box>
            <Typography variant="body2" color="text.secondary" mb={2}>Select vehicles for this deployment</Typography>
            {unassignedVehicles.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No available vehicles.</Typography>
            ) : (
              <Stack spacing={2}>
                {Object.entries(
                  unassignedVehicles.reduce<Record<string, VehicleOption[]>>((acc, v) => {
                    ;(acc[v.type] ??= []).push(v)
                    return acc
                  }, {})
                ).map(([type, group]) => (
                  <Box key={type}>
                    <Typography variant="caption" fontWeight={700} color="text.secondary"
                      sx={{ textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', mb: 0.5 }}>
                      {type.replace(/_/g, ' ')}
                    </Typography>
                    <List dense disablePadding>
                      {group.map((v) => {
                        const Icon = VEHICLE_ICON[v.type] ?? LocalShippingIcon
                        return (
                          <ListItem key={v.id} disablePadding>
                            <ListItemIcon sx={{ minWidth: 36 }}>
                              <Checkbox size="small" checked={selVehicles.has(v.id)}
                                onChange={(e) => { const s = new Set(selVehicles); e.target.checked ? s.add(v.id) : s.delete(v.id); setSelVehicles(s) }} />
                            </ListItemIcon>
                            <ListItemIcon sx={{ minWidth: 32 }}><Icon fontSize="small" /></ListItemIcon>
                            <ListItemText primary={v.name} />
                          </ListItem>
                        )
                      })}
                    </List>
                  </Box>
                ))}
              </Stack>
            )}
            {selVehicles.size === 0 && <Alert severity="warning" sx={{ mt: 1 }}>At least one vehicle is recommended</Alert>}
          </Box>
        )}
        {step === 2 && (
          <Box>
            <Typography variant="body2" color="text.secondary" mb={2}>Select items to pack into this kit</Typography>
            <TextField
              select
              label="Source hub for consumables"
              value={sourceHubId}
              onChange={(e) => setSourceHubId(e.target.value)}
              fullWidth
              size="small"
              sx={{ mb: 2 }}
              required={hasConsumableInKit}
              error={hasConsumableInKit && !sourceHubId}
              helperText={hasConsumableInKit
                ? 'Consumables are drawn from this hub.'
                : 'Required only when the kit includes a consumable.'}
            >
              {hubs.map((h) => (
                <MenuItem key={h.id} value={h.id}>{h.name} — {h.city}, {h.state}</MenuItem>
              ))}
            </TextField>
            {availableItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No available items.</Typography>
            ) : (
              <Stack spacing={2.5}>
                {Object.entries(
                  availableItems.reduce<Record<string, InventoryOption[]>>((acc, item) => {
                    const cat = item.category?.name ?? 'Uncategorized'
                    ;(acc[cat] ??= []).push(item)
                    return acc
                  }, {})
                ).map(([catName, catItems]) => (
                  <Box key={catName}>
                    <Typography variant="caption" fontWeight={700} color="text.secondary"
                      sx={{ textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', mb: 0.75 }}>
                      {catName}
                    </Typography>
                    <Stack spacing={1}>
                      {catItems.map((item) => (
                        <KitItemSelectRow key={item.id} item={item} selected={kitItems} onChange={setKitItems} />
                      ))}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
            {kitItems.size === 0 && <Alert severity="warning" sx={{ mt: 1 }}>Starting with empty kit</Alert>}
          </Box>
        )}
        {step === 3 && (
          <Stack spacing={2}>
            <TextField label="Deployment note (required)" value={note} onChange={(e) => setNote(e.target.value)}
              multiline rows={3} fullWidth placeholder="e.g. Starting TX deployment with Truck 01 and Christie Drill kit" required />
            {hasUnresolved && (
              <Alert severity="warning">
                This kit includes a consumable — go back to “Build Kit” and choose a source hub before launching.
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        {step > 0 && <Button onClick={() => setStep((s) => s - 1)} disabled={loading}>Back</Button>}
        {step < 3 ? (
          <Button variant="contained" onClick={() => setStep((s) => s + 1)} disabled={step === 0 && !operatorId}>Next</Button>
        ) : (
          <Button variant="contained" onClick={launch} disabled={loading || hasUnresolved}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}>
            {loading ? 'Launching…' : 'Launch Deployment'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

// ── Deployment Detail Drawer ──────────────────────────────────────

function DeploymentDrawer({
  rig: initialRig, operators, vehicles, inventoryItems, hubs, onClose, onUpdated, showToast, initialAction = null,
}: {
  rig: Rig
  operators: UserOption[]
  vehicles: VehicleOption[]
  inventoryItems: InventoryOption[]
  hubs: HubOption[]
  onClose: () => void
  onUpdated: () => void
  showToast: (msg: string, severity?: 'success' | 'error') => void
  initialAction?: 'transfer' | 'end' | null
}) {
  const [rig, setRig] = React.useState(initialRig)
  const [removingVehicles, setRemovingVehicles] = React.useState(false)
  const [selVehicles, setSelVehicles] = React.useState<Set<string>>(new Set())
  const [removingItems, setRemovingItems] = React.useState(false)
  const [selItems, setSelItems] = React.useState<Set<string>>(new Set())
  const [removeDialog, setRemoveDialog] = React.useState<{ open: boolean; kitItem: KitItemRow | null }>({ open: false, kitItem: null })
  const [removeQty, setRemoveQty] = React.useState(1)
  const [removeCondition, setRemoveCondition] = React.useState<ReturnCondition>('GOOD')
  const [addVehicleOpen, setAddVehicleOpen] = React.useState(false)
  const [pendingVehicles, setPendingVehicles] = React.useState<Set<string>>(new Set())
  const [isRentalToggle, setIsRentalToggle] = React.useState(false)
  const [rentalFields, setRentalFields] = React.useState<Partial<RentalVehicleFields>>({})
  const [rentalSubmitLoading, setRentalSubmitLoading] = React.useState(false)
  const [rentalError, setRentalError] = React.useState('')
  const [addItemOpen, setAddItemOpen] = React.useState(false)
  const [pendingItems, setPendingItems] = React.useState<Map<string, AdminKitEntry>>(new Map())
  const [noteDialog, setNoteDialog] = React.useState<null | 'addVehicles' | 'removeVehicles' | 'addItems' | 'removeItems' | 'end'>(null)
  const [vehicleDispositions, setVehicleDispositions] = React.useState<Map<string, { dispositionType: string; toOperatorId?: string }>>(new Map())
  const [vehicleRemoveNote, setVehicleRemoveNote] = React.useState('')
  const [actionLoading, setActionLoading] = React.useState(false)
  const [transferOpen, setTransferOpen] = React.useState(false)
  const [pendingTransfers, setPendingTransfers] = React.useState<TransferRow[]>([])
  const [cancelTransferId, setCancelTransferId] = React.useState<string | null>(null)
  const [cancelLoading, setCancelLoading] = React.useState(false)
  const [addingOperator, setAddingOperator] = React.useState(false)
  const [operatorToAdd, setOperatorToAdd] = React.useState('')
  const [reassignOpen, setReassignOpen] = React.useState(false)
  const [reassignTargetId, setReassignTargetId] = React.useState('')
  const [reassignNote, setReassignNote] = React.useState('')
  const [reassignLoading, setReassignLoading] = React.useState(false)
  const [history, setHistory] = React.useState<Array<{
    id: string; action: string; submittedAt: string; notes: string | null
    item: { name: string }; operator: { name: string } | null
    inventoryUnit: { serialNumber: string | null; qrCodeId: string } | null
  }>>([])

  React.useEffect(() => { setRig(initialRig) }, [initialRig])

  // When opened from a row shortcut, jump straight into the transfer or
  // end-deployment flow (only valid for active deployments).
  React.useEffect(() => {
    if (initialRig.endedAt) return
    if (initialAction === 'transfer') setTransferOpen(true)
    else if (initialAction === 'end') setNoteDialog('end')
  }, [initialRig, initialAction])

  React.useEffect(() => {
    fetch(`/api/deployments/${initialRig.id}/history`)
      .then((r) => r.json())
      .then((d) => setHistory(d.data ?? []))
      .catch(() => {})
  }, [initialRig.id])

  const loadTransfers = React.useCallback(async () => {
    const res = await fetch(`/api/transfers?status=PENDING`)
    if (res.ok) {
      const all: TransferRow[] = await res.json()
      setPendingTransfers(all.filter((t) => t.vehicles.length > 0 || t.items.length > 0))
    }
  }, [])

  React.useEffect(() => { loadTransfers() }, [loadTransfers])

  const outgoingTransfers = pendingTransfers.filter((t) => t.fromRig.id === rig.id)
  const kitItems = rig.kits.flatMap((k) => k.items)
  const unassignedVehicles = vehicles.filter((v) => !v.assignedOperatorId || v.assignedOperatorId === rig.operator.id)
  const availableItems = inventoryItems.filter((i) =>
    i.itemType === 'SERIALIZED' ? i.unitCounts.available > 0 : i.quantity > 0
  )
  const isActive = !rig.endedAt

  const refresh = async () => {
    const res = await fetch(`/api/deployments/${rig.id}`)
    if (res.ok) { const d = await res.json(); setRig(d) }
    await loadTransfers()
    onUpdated()
  }

  const handleReassignPrimary = async () => {
    if (!reassignTargetId || !reassignNote.trim()) return
    setReassignLoading(true)
    try {
      const res = await fetch(`/api/deployments/${rig.id}/handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toOperatorId: reassignTargetId, note: reassignNote, force: true }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast(typeof d.error === 'string' ? d.error : 'Could not reassign primary operator.', 'error')
        return
      }
      setReassignOpen(false)
      setReassignTargetId('')
      setReassignNote('')
      showToast('Primary operator reassigned.')
      await refresh()
    } catch {
      showToast('Network error. Please try again.', 'error')
    } finally {
      setReassignLoading(false)
    }
  }

  const handleAddOperator = async (rigId: string) => {
    setAddingOperator(true)
    try {
      const res = await fetch(`/api/deployments/${rigId}/operators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorId: operatorToAdd }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast(typeof d.error === 'string' ? d.error : 'Could not add operator.', 'error')
        return
      }
      setOperatorToAdd('')
      showToast('Operator added.')
      await refresh()
    } catch {
      showToast('Network error. Please try again.', 'error')
    } finally {
      setAddingOperator(false)
    }
  }

  const handleRemoveOperator = async (rigId: string, operatorId: string) => {
    try {
      const res = await fetch(`/api/deployments/${rigId}/operators`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorId }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast(typeof d.error === 'string' ? d.error : 'Could not remove operator.', 'error')
        return
      }
      showToast('Operator removed.')
      await refresh()
    } catch {
      showToast('Network error. Please try again.', 'error')
    }
  }

  const handleCancelTransfer = async () => {
    if (!cancelTransferId) return
    setCancelLoading(true)
    try {
      const res = await fetch(`/api/transfers/${cancelTransferId}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast(typeof d.error === 'string' ? d.error : 'Could not cancel the transfer.', 'error')
        return
      }
      showToast('Transfer cancelled.')
      setCancelTransferId(null)
      await loadTransfers()
    } catch {
      showToast('Network error. Please try again.', 'error')
    } finally {
      setCancelLoading(false)
    }
  }

  const handleAddVehicles = async (note: string, photoUrls: string[]) => {
    setActionLoading(true)
    const res = await fetch(`/api/deployments/${rig.id}/vehicles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicleIds: Array.from(pendingVehicles), note, photoUrls }),
    })
    setActionLoading(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      showToast(typeof d.error === 'string' ? d.error : 'Failed to add vehicles', 'error')
      return
    }
    setNoteDialog(null)
    setAddVehicleOpen(false)
    setPendingVehicles(new Set())
    await refresh()
  }

  // NEW-5: create a rental vehicle and add it to this deployment in one step.
  const handleAddRental = async () => {
    setRentalError('')
    setRentalSubmitLoading(true)
    try {
      const vRes = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rentalFieldsToVehiclePayload(rentalFields)),
      })
      const vJson = await vRes.json().catch(() => ({}))
      if (!vRes.ok) {
        setRentalError(vJson.error?.formErrors?.[0] ?? (typeof vJson.error === 'string' ? vJson.error : 'Failed to create vehicle'))
        return
      }
      const vehicleId: string = vJson.data.id
      const addRes = await fetch(`/api/deployments/${rig.id}/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleIds: [vehicleId], note: 'Added rental vehicle', photoUrls: [] }),
      })
      if (!addRes.ok) {
        const d = await addRes.json().catch(() => ({}))
        setRentalError(typeof d.error === 'string' ? d.error : 'Failed to add vehicle to deployment')
        return
      }
      setAddVehicleOpen(false)
      setIsRentalToggle(false)
      setRentalFields({})
      await refresh()
    } finally {
      setRentalSubmitLoading(false)
    }
  }

  const handleRemoveVehicles = async () => {
    setActionLoading(true)
    const vehiclesList = Array.from(selVehicles).map((vehicleId) => {
      const disp = vehicleDispositions.get(vehicleId)
      return {
        vehicleId,
        dispositionType: disp?.dispositionType ?? 'AVAILABLE',
        toOperatorId: disp?.toOperatorId,
      }
    })
    const res = await fetch(`/api/deployments/${rig.id}/vehicles`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicles: vehiclesList, note: vehicleRemoveNote || 'Removed from rig' }),
    })
    setActionLoading(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      showToast(typeof d.error === 'string' ? d.error : 'Failed to remove vehicles', 'error')
      return
    }
    setNoteDialog(null)
    setRemovingVehicles(false)
    setSelVehicles(new Set())
    setVehicleDispositions(new Map())
    setVehicleRemoveNote('')
    await refresh()
  }

  const handleAddItems = async (note: string, photoUrls: string[]) => {
    setActionLoading(true)
    const res = await fetch(`/api/deployments/${rig.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: Array.from(pendingItems.values()).map((entry) =>
          entry.itemType === 'SERIALIZED'
            ? { inventoryItemId: entry.inventoryItemId, inventoryUnitId: entry.inventoryUnitId, itemType: 'SERIALIZED' }
            : { inventoryItemId: entry.inventoryItemId, quantity: entry.quantity }
        ),
        note,
        photoUrls,
      }),
    })
    setActionLoading(false)
    if (res.status === 409) {
      const err = await res.json()
      const m = new Map(pendingItems)
      for (const [key, entry] of m) { if (entry.itemType === 'SERIALIZED') m.delete(key) }
      setPendingItems(m)
      setNoteDialog(null)
      setAddItemOpen(true)
      await refresh()
      showToast(err.error ?? 'A unit was just taken. Please reselect.', 'error')
      return
    }
    setNoteDialog(null)
    setAddItemOpen(false)
    setPendingItems(new Map())
    await refresh()
  }

  const handleRemoveItem = async () => {
    if (!removeDialog.kitItem) return
    const res = await fetch(`/api/deployments/${rig.id}/items/${removeDialog.kitItem.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: removeQty, returnCondition: removeCondition }),
    })
    if (res.ok) {
      setRemoveDialog({ open: false, kitItem: null })
      await refresh()
    }
  }

  const selectedItems = kitItems
    .filter((ki) => selItems.has(ki.id))
    .map((ki) => ({
      kitItemId: ki.id,
      itemId: ki.item.id,
      name: ki.item.name,
      quantity: ki.quantity,
      itemType: ki.item.itemType,
      inventoryUnit: ki.inventoryUnit ?? null,
    }))

  const allKitItemSummaries = kitItems.map((ki) => ({
    kitItemId: ki.id,
    itemId: ki.item.id,
    name: ki.item.name,
    quantity: ki.quantity,
    itemType: ki.item.itemType,
    inventoryUnit: ki.inventoryUnit ?? null,
  }))

  return (
    <>
      <Drawer anchor="right" open={true} onClose={onClose} PaperProps={{ sx: { width: 560 } }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box px={3} pt={3} pb={2}>
            <Stack direction="row" alignItems="center" spacing={1.5} mb={1}>
              <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36, fontSize: 14 }}>{initials(rig.operator.name)}</Avatar>
              <Box>
                <Typography variant="h6" fontWeight={700}>{rig.operator.name}</Typography>
                {rig.label && <Typography variant="body2" color="text.secondary">{rig.label}</Typography>}
              </Box>
              <Box flexGrow={1} />
              <Chip size="small" label={isActive ? 'Active' : 'Ended'} color={isActive ? 'success' : 'default'} />
            </Stack>
            {rig.project && <Typography variant="body2" color="text.secondary">Project: {rig.project.name}</Typography>}
            <Typography variant="caption" color="text.secondary">Started {relativeDate(rig.startedAt)}</Typography>
          </Box>
          <Divider />

          <Box sx={{ flex: 1, overflow: 'auto', px: 3, py: 2 }}>
            {outgoingTransfers.length > 0 && (
              <Box mb={2}>
                <Typography variant="subtitle2" fontWeight={600} mb={1}>Outgoing Pending Transfers</Typography>
                <Stack spacing={1}>
                  {outgoingTransfers.map((tr) => {
                    const summary = [
                      tr.vehicles.map((tv) => tv.vehicle.name).join(', '),
                      tr.items.map((ti) => `${ti.kitItem.item.name} ×${ti.kitItem.quantity}`).join(', '),
                    ].filter(Boolean).join(', ')
                    return (
                      <Box key={tr.id} sx={{ p: 1.5, border: '1px solid', borderColor: 'warning.main', borderRadius: 1 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                          <Box>
                            <Typography variant="body2" fontWeight={600}>→ {tr.toOperator.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{summary}</Typography>
                            <Typography variant="caption" color="text.secondary" display="block">{tr.note}</Typography>
                            <Typography variant="caption" color="text.secondary">{new Date(tr.createdAt).toLocaleDateString()}</Typography>
                          </Box>
                          <MutationButton size="small" color="error" onClick={() => setCancelTransferId(tr.id)}>Cancel</MutationButton>
                        </Stack>
                      </Box>
                    )
                  })}
                </Stack>
                <Divider sx={{ mt: 2 }} />
              </Box>
            )}

            {/* Vehicles */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="subtitle2" fontWeight={600}>Rig</Typography>
              {isActive && (
                <Stack direction="row" spacing={1}>
                  <MutationButton size="small" variant="outlined" onClick={() => setAddVehicleOpen(true)}>Add Vehicles</MutationButton>
                  {rig.vehicles.length > 0 && !removingVehicles && (
                    <MutationButton size="small" variant="outlined" color="error" onClick={() => setRemovingVehicles(true)}>Remove</MutationButton>
                  )}
                  {removingVehicles && selVehicles.size > 0 && (
                    <MutationButton size="small" variant="contained" color="error" onClick={() => {
                      // Initialize each selected vehicle with default disposition
                      const m = new Map<string, { dispositionType: string; toOperatorId?: string }>()
                      for (const vid of selVehicles) m.set(vid, { dispositionType: 'AVAILABLE' })
                      setVehicleDispositions(m)
                      setVehicleRemoveNote('')
                      setNoteDialog('removeVehicles')
                    }}>
                      Remove ({selVehicles.size})
                    </MutationButton>
                  )}
                  {removingVehicles && (
                    <Button size="small" onClick={() => { setRemovingVehicles(false); setSelVehicles(new Set()) }}>Cancel</Button>
                  )}
                </Stack>
              )}
            </Stack>
            {rig.vehicles.length === 0 ? (
              <Typography variant="body2" color="text.secondary" mb={2}>No vehicles in this deployment.</Typography>
            ) : (
              <Stack spacing={0.5} mb={2}>
                {rig.vehicles.map((rv) => {
                  const Icon = VEHICLE_ICON[rv.vehicle.type] ?? LocalShippingIcon
                  return (
                    <Stack key={rv.id} direction="row" alignItems="center" spacing={1}>
                      {removingVehicles && (
                        <Checkbox size="small" checked={selVehicles.has(rv.vehicle.id)}
                          onChange={(e) => { const s = new Set(selVehicles); e.target.checked ? s.add(rv.vehicle.id) : s.delete(rv.vehicle.id); setSelVehicles(s) }} />
                      )}
                      <Icon fontSize="small" color="action" />
                      <Typography variant="body2">{rv.vehicle.name}</Typography>
                      {rv.vehicle.isRental && (
                        <Chip label="Rental" size="small" color="warning" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                      )}
                      {rv.vehicle.isRental && !rv.vehicle.rentalAgreementUrl && (
                        <Chip label="Agreement needed" size="small" color="error" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                      )}
                      <Chip size="small" label={rv.vehicle.type} variant="outlined" sx={{ ml: 'auto !important', height: 18, fontSize: 10 }} />
                    </Stack>
                  )
                })}
              </Stack>
            )}

            <Divider sx={{ my: 2 }} />

            {/* Kit */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="subtitle2" fontWeight={600}>Kit</Typography>
              {isActive && (
                <Stack direction="row" spacing={1}>
                  <MutationButton size="small" variant="outlined" onClick={() => setAddItemOpen(true)}>Add Items</MutationButton>
                  {kitItems.length > 0 && !removingItems && (
                    <MutationButton size="small" variant="outlined" color="error" onClick={() => setRemovingItems(true)}>Remove</MutationButton>
                  )}
                  {removingItems && selItems.size > 0 && (
                    <MutationButton size="small" variant="contained" color="error" onClick={() => setNoteDialog('removeItems')}>
                      Remove ({selItems.size})
                    </MutationButton>
                  )}
                  {removingItems && (
                    <Button size="small" onClick={() => { setRemovingItems(false); setSelItems(new Set()) }}>Cancel</Button>
                  )}
                </Stack>
              )}
            </Stack>
            {kitItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Empty kit.</Typography>
            ) : (
              <Stack spacing={0.5}>
                {kitItems.map((ki) => (
                  <Stack key={ki.id} direction="row" alignItems="center" spacing={1}>
                    {removingItems && (
                      <Checkbox size="small" checked={selItems.has(ki.id)}
                        onChange={(e) => { const s = new Set(selItems); e.target.checked ? s.add(ki.id) : s.delete(ki.id); setSelItems(s) }} />
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
                    <Typography variant="body2" color="text.secondary">×{ki.quantity}</Typography>
                    {isActive && !removingItems && (
                      <MutationIconButton size="small" tooltip="Return item" color="error"
                        onClick={() => {
                          setRemoveDialog({ open: true, kitItem: ki })
                          setRemoveQty(ki.quantity)
                          setRemoveCondition('GOOD')
                        }}>
                        <RemoveCircleOutlineIcon fontSize="small" />
                      </MutationIconButton>
                    )}
                  </Stack>
                ))}
              </Stack>
            )}

            <Divider sx={{ my: 2 }} />

            {/* Team */}
            <Box mt={2}>
              <Typography variant="subtitle2" fontWeight={600} mb={0.75}>Team</Typography>
              <Stack spacing={0.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2">{rig.operator.name}</Typography>
                  <Typography variant="caption" color="text.secondary">Primary</Typography>
                </Stack>
                {rig.secondaryOperators?.map((ro) => (
                  <Stack key={ro.id} direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2">{ro.operator.name}</Typography>
                    {isActive && (
                      <MutationIconButton size="small" tooltip="Remove operator" onClick={() => handleRemoveOperator(rig.id, ro.operatorId)}>
                        <CloseIcon fontSize="small" />
                      </MutationIconButton>
                    )}
                  </Stack>
                ))}
              </Stack>
              {isActive && (addingOperator ? (
                <Stack direction="row" spacing={1} mt={1}>
                  <TextField
                    select size="small" label="Add operator" value={operatorToAdd}
                    onChange={(e) => setOperatorToAdd(e.target.value)} sx={{ flex: 1 }}
                  >
                    {operators
                      .filter((u) => u.role === 'OPERATOR' && u.id !== rig.operator.id && !rig.secondaryOperators?.some((ro) => ro.operatorId === u.id))
                      .map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
                  </TextField>
                  <MutationButton size="small" variant="contained" disabled={!operatorToAdd}
                    onClick={() => handleAddOperator(rig.id)}>Add</MutationButton>
                  <Button size="small" onClick={() => { setAddingOperator(false); setOperatorToAdd('') }}>Cancel</Button>
                </Stack>
              ) : (
                <Stack direction="row" spacing={1} mt={0.5}>
                  <MutationButton size="small" onClick={() => setAddingOperator(true)}>
                    + Add Operator
                  </MutationButton>
                  <MutationButton size="small" color="warning" onClick={() => { setReassignOpen(true); setReassignTargetId(''); setReassignNote('') }}>
                    Reassign Primary…
                  </MutationButton>
                </Stack>
              ))}
            </Box>

            {history.length > 0 && (
              <Box mt={2}>
                <Typography variant="subtitle2" fontWeight={600} mb={1}>Deployment History</Typography>
                <Stack spacing={0.5}>
                  {history.slice(0, 20).map((log) => (
                    <Stack key={log.id} direction="row" spacing={1} alignItems="flex-start">
                      <Chip
                        label={log.action === 'CHECK_OUT' ? 'Out' : 'In'}
                        size="small"
                        color={log.action === 'CHECK_OUT' ? 'primary' : 'success'}
                        variant="outlined"
                        sx={{ minWidth: 40, fontSize: 10 }}
                      />
                      <Box>
                        <Typography variant="body2">{log.item.name}{log.inventoryUnit?.serialNumber ? ` #${log.inventoryUnit.serialNumber}` : ''}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {log.operator?.name} · {new Date(log.submittedAt).toLocaleDateString()}
                          {log.notes ? ` · ${log.notes}` : ''}
                        </Typography>
                      </Box>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            )}
          </Box>

          {isActive && (
            <>
              <Divider />
              <Stack direction="row" spacing={1} px={3} py={2}>
                <MutationButton variant="outlined" startIcon={<SwapHorizIcon />} onClick={() => setTransferOpen(true)}>Transfer…</MutationButton>
                <Box flexGrow={1} />
                <MutationButton variant="outlined" color="error" startIcon={<StopCircleIcon />} onClick={() => setNoteDialog('end')}>
                  End Deployment
                </MutationButton>
              </Stack>
            </>
          )}
        </Box>
      </Drawer>

      {/* Add Vehicles picker */}
      <Dialog open={addVehicleOpen} onClose={() => {
        setAddVehicleOpen(false); setPendingVehicles(new Set())
        setIsRentalToggle(false); setRentalFields({}); setRentalError('')
      }} maxWidth={isRentalToggle ? 'sm' : 'xs'} fullWidth>
        <DialogTitle>Add Vehicles</DialogTitle>
        <DialogContent>
          <FormControlLabel
            control={<Switch checked={isRentalToggle} onChange={(e) => { setIsRentalToggle(e.target.checked); setRentalFields({}); setRentalError('') }} />}
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
                            onChange={(e) => { const s = new Set(pendingVehicles); e.target.checked ? s.add(v.id) : s.delete(v.id); setPendingVehicles(s) }} />
                        </ListItemIcon>
                        <ListItemIcon sx={{ minWidth: 32 }}><Icon fontSize="small" /></ListItemIcon>
                        <ListItemText primary={v.name} />
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
              disabled={rentalSubmitLoading || !isRentalFormValid(rentalFields)}
              startIcon={rentalSubmitLoading ? <CircularProgress size={16} color="inherit" /> : null}
              onClick={handleAddRental}>
              {rentalSubmitLoading ? 'Adding…' : 'Add Rental Vehicle'}
            </Button>
          ) : (
            <Button variant="contained" disabled={pendingVehicles.size === 0}
              onClick={() => { setAddVehicleOpen(false); setNoteDialog('addVehicles') }}>Continue</Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Add Items picker */}
      <Dialog open={addItemOpen} onClose={() => { setAddItemOpen(false); setPendingItems(new Map()) }} maxWidth="sm" fullWidth>
        <DialogTitle>Add Items</DialogTitle>
        <DialogContent>
          {availableItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No available items.</Typography>
          ) : (
            <Stack spacing={1} mt={1}>
              {availableItems.map((item) => (
                <KitItemSelectRow key={item.id} item={item} selected={pendingItems} onChange={setPendingItems} showCategoryChip />
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setAddItemOpen(false); setPendingItems(new Map()) }}>Cancel</Button>
          <Button variant="contained"
            disabled={pendingItems.size === 0}
            onClick={() => { setAddItemOpen(false); setNoteDialog('addItems') }}>Continue</Button>
        </DialogActions>
      </Dialog>

      {/* NotePhotoDialogs — vehicles and addItems only */}
      <NotePhotoDialog
        open={noteDialog === 'addVehicles'}
        title="Add vehicles to rig"
        loading={actionLoading}
        onClose={() => setNoteDialog(null)}
        onConfirm={handleAddVehicles}
        confirmLabel="Add Vehicles"
      />
      {/* Vehicle disposition dialog */}
      <Dialog
        open={noteDialog === 'removeVehicles'}
        onClose={() => setNoteDialog(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Remove {selVehicles.size} Vehicle{selVehicles.size !== 1 ? 's' : ''} from Rig</DialogTitle>
        <DialogContent>
          <TextField
            label="Overall note"
            value={vehicleRemoveNote}
            onChange={(e) => setVehicleRemoveNote(e.target.value)}
            fullWidth multiline rows={2} sx={{ mb: 3, mt: 1 }}
          />
          <Stack spacing={2} divider={<Divider />}>
            {Array.from(selVehicles).map((vehicleId) => {
              const rv = rig.vehicles.find((r) => r.vehicle.id === vehicleId)
              const disp = vehicleDispositions.get(vehicleId) ?? { dispositionType: 'AVAILABLE' }
              return (
                <Stack key={vehicleId} spacing={1}>
                  <Typography variant="body2" fontWeight={600}>{rv?.vehicle.name ?? vehicleId}</Typography>
                  <TextField
                    select label="Disposition" size="small"
                    value={disp.dispositionType}
                    onChange={(e) => {
                      const m = new Map(vehicleDispositions)
                      m.set(vehicleId, { ...disp, dispositionType: e.target.value })
                      setVehicleDispositions(m)
                    }}
                  >
                    <MenuItem value="AVAILABLE">Return to Fleet (Available)</MenuItem>
                    <MenuItem value="IN_MAINTENANCE">Send to Maintenance</MenuItem>
                    <MenuItem value="RETIRED">Retire Vehicle</MenuItem>
                    <MenuItem value="TRANSFER">Transfer to Another Operator</MenuItem>
                  </TextField>
                  {disp.dispositionType === 'TRANSFER' && (
                    <TextField
                      select label="Destination operator" size="small"
                      value={disp.toOperatorId ?? ''}
                      onChange={(e) => {
                        const m = new Map(vehicleDispositions)
                        m.set(vehicleId, { ...disp, toOperatorId: e.target.value })
                        setVehicleDispositions(m)
                      }}
                    >
                      <MenuItem value="" disabled>Select operator…</MenuItem>
                      {operators.filter((o) => o.id !== rig.operator.id).map((o) => (
                        <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
                      ))}
                    </TextField>
                  )}
                </Stack>
              )
            })}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setNoteDialog(null)} disabled={actionLoading}>Cancel</Button>
          <Button
            variant="contained" color="error"
            onClick={handleRemoveVehicles}
            disabled={actionLoading}
            startIcon={actionLoading ? <CircularProgress size={16} /> : undefined}
          >
            {actionLoading ? 'Working…' : 'Confirm Remove'}
          </Button>
        </DialogActions>
      </Dialog>
      <NotePhotoDialog
        open={noteDialog === 'addItems'}
        title="Add items to kit"
        loading={actionLoading}
        onClose={() => setNoteDialog(null)}
        onConfirm={handleAddItems}
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
          <ConditionSelect label="Condition" value={removeCondition} onChange={setRemoveCondition} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRemoveDialog({ open: false, kitItem: null })}>Cancel</Button>
          <MutationButton variant="contained" color="error" onClick={handleRemoveItem}>Return</MutationButton>
        </DialogActions>
      </Dialog>

      {/* DispositionDialog — remove items */}
      {noteDialog === 'removeItems' && selectedItems.length > 0 && (
        <DispositionDialog
          open={true}
          mode="remove-items"
          deploymentId={rig.id}
          currentOperatorId={rig.operator.id}
          operators={operators}
          hubs={hubs}
          items={selectedItems}
          onComplete={() => {
            setNoteDialog(null)
            setRemovingItems(false)
            setSelItems(new Set())
            void refresh()
          }}
          onClose={() => setNoteDialog(null)}
        />
      )}

      {/* DispositionDialog — end deployment */}
      {noteDialog === 'end' && (
        <DispositionDialog
          open={true}
          mode="end-deployment"
          deploymentId={rig.id}
          currentOperatorId={rig.operator.id}
          operators={operators}
          hubs={hubs}
          items={allKitItemSummaries}
          onComplete={() => {
            setNoteDialog(null)
            void refresh().then(() => onClose())
          }}
          onClose={() => setNoteDialog(null)}
        />
      )}

      {transferOpen && (
        <TransferDialog rig={rig} operators={operators} excludeOperatorId={rig.operator.id} onClose={() => setTransferOpen(false)} onSuccess={refresh} showToast={(t) => showToast(t.message, t.severity === 'error' ? 'error' : 'success')} />
      )}

      {/* Cancel transfer confirm */}
      <Dialog open={!!cancelTransferId} onClose={() => setCancelTransferId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel Transfer</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to cancel this pending transfer?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCancelTransferId(null)} disabled={cancelLoading}>Keep</Button>
          <MutationButton variant="contained" color="error" onClick={handleCancelTransfer} disabled={cancelLoading}
            startIcon={cancelLoading ? <CircularProgress size={16} color="inherit" /> : null}>
            {cancelLoading ? 'Cancelling…' : 'Cancel Transfer'}
          </MutationButton>
        </DialogActions>
      </Dialog>

      {/* Reassign primary operator (admin force handoff) */}
      <Dialog open={reassignOpen} onClose={() => setReassignOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reassign Primary Operator</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Immediately reassigns primary responsibility. Takes effect without the new operator needing to accept.
          </Typography>
          <TextField
            select label="Reassign to" value={reassignTargetId}
            onChange={(e) => setReassignTargetId(e.target.value)} fullWidth sx={{ mb: 2 }}
          >
            {operators.filter((u) => u.role === 'OPERATOR' && u.id !== rig.operator.id).map((u) => (
              <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Reason (required)"
            value={reassignNote}
            onChange={(e) => setReassignNote(e.target.value)}
            multiline rows={2} fullWidth
            placeholder="e.g. Operator unavailable — emergency reassignment"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setReassignOpen(false)} disabled={reassignLoading}>Cancel</Button>
          <MutationButton variant="contained" color="warning"
            disabled={!reassignTargetId || !reassignNote.trim() || reassignLoading}
            onClick={handleReassignPrimary}
            startIcon={reassignLoading ? <CircularProgress size={16} color="inherit" /> : null}>
            {reassignLoading ? 'Reassigning…' : 'Reassign Primary'}
          </MutationButton>
        </DialogActions>
      </Dialog>
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────

export default function AdminDeploymentsPage() {
  const canEdit = useCanEdit()
  const [rigs, setRigs] = React.useState<Rig[]>([])
  const [loading, setLoading] = React.useState(true)
  const toast = useToast()
  const [showEnded, setShowEnded] = React.useState(false)
  const [filterOperator, setFilterOperator] = React.useState('')
  const [filterProject, setFilterProject] = React.useState('')
  const [operators, setOperators] = React.useState<UserOption[]>([])
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([])
  const [vehicles, setVehicles] = React.useState<VehicleOption[]>([])
  const [inventoryItems, setInventoryItems] = React.useState<InventoryOption[]>([])
  const [hubs, setHubs] = React.useState<HubOption[]>([])
  const [drawerRig, setDrawerRig] = React.useState<Rig | null>(null)
  const [drawerAction, setDrawerAction] = React.useState<'transfer' | 'end' | null>(null)
  const [newOpen, setNewOpen] = React.useState(false)

  // Pending transfers — admin can accept or decline on behalf of the destination operator
  const [pendingTransfers, setPendingTransfers] = React.useState<TransferRow[]>([])
  const [respondDialog, setRespondDialog] = React.useState<{ transfer: TransferRow; action: 'accept' | 'decline' } | null>(null)
  const [responseNote, setResponseNote] = React.useState('')
  const [respondLoading, setRespondLoading] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ active: showEnded ? 'false' : 'true' })
    if (filterOperator) params.set('operatorId', filterOperator)
    if (filterProject) params.set('projectId', filterProject)
    const res = await fetch(`/api/deployments?${params}`)
    if (res.ok) setRigs(await res.json())
    setLoading(false)
  }, [showEnded, filterOperator, filterProject])

  const loadTransfers = React.useCallback(async () => {
    const res = await fetch('/api/transfers?status=PENDING')
    if (res.ok) setPendingTransfers(await res.json())
  }, [])

  React.useEffect(() => { load() }, [load])
  React.useEffect(() => { loadTransfers() }, [loadTransfers])

  React.useEffect(() => {
    fetch('/api/users').then((r) => r.json()).then((d) => setOperators(d.data ?? [])).catch(() => {})
    fetch('/api/projects').then((r) => r.json()).then((d) => setProjects(d.data ?? d ?? [])).catch(() => {})
    fetch('/api/vehicles').then((r) => r.json()).then((d) => setVehicles(d.data ?? d ?? [])).catch(() => {})
    fetch('/api/inventory?pageSize=200').then((r) => r.json()).then((d) => {
      const items = (d.data ?? []).map((item: InventoryOption & { units?: { id: string; serialNumber: string | null; status: string }[] }) => ({
        ...item,
        availableUnits: (item.units ?? [])
          .filter((u) => u.status === 'AVAILABLE')
          .map((u, idx) => ({ id: u.id, serialNumber: u.serialNumber, position: idx + 1 })),
      }))
      setInventoryItems(items)
    }).catch(() => {})
    fetch('/api/hubs').then((r) => r.json()).then((d) => setHubs(d ?? [])).catch(() => {})
  }, [])

  // UR-017: route through the shared bottom-center Snackbar; keep the
  // (msg, severity) signature so the drawer/dialog call sites are unchanged.
  const showToast = React.useCallback(
    (msg: string, severity: 'success' | 'error' = 'success') => toast({ message: msg, severity }),
    [toast],
  )
  const activeCount = rigs.filter((r) => !r.endedAt).length

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
        showToast(typeof d.error === 'string' ? d.error : `Could not ${action} the transfer.`, 'error')
        return
      }
      setRespondDialog(null)
      setResponseNote('')
      showToast(action === 'accept' ? 'Transfer accepted' : 'Transfer declined')
      await Promise.all([load(), loadTransfers()])
    } catch {
      showToast('Network error. Please try again.', 'error')
    } finally {
      setRespondLoading(false)
    }
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h5">Deployments</Typography>
            {!canEdit && <Chip size="small" label="View only" variant="outlined" />}
          </Stack>
          <Typography variant="body2" color="text.secondary">{activeCount} active</Typography>
        </Box>
        <MutationButton variant="contained" startIcon={<AddIcon />} onClick={() => setNewOpen(true)}>
          New Deployment
        </MutationButton>
      </Stack>


      {/* Pending transfers — admin accept / decline */}
      {pendingTransfers.length > 0 && (
        <Box mb={3}>
          <Typography variant="subtitle2" fontWeight={600} mb={1}>
            Pending Transfers ({pendingTransfers.length})
          </Typography>
          <Stack spacing={1}>
            {pendingTransfers.map((tr) => {
              const vehicleNames = tr.vehicles.map((tv) => tv.vehicle.name).join(', ')
              const itemNames = tr.items.map((ti) => `${ti.kitItem.item.name} ×${ti.kitItem.quantity}`).join(', ')
              const summary = [vehicleNames, itemNames].filter(Boolean).join(', ')
              return (
                <Alert key={tr.id} severity="warning" icon={false}
                  action={
                    <Stack direction="row" spacing={1} sx={{ mt: -0.5 }}>
                      <MutationButton size="small" color="error" variant="outlined"
                        onClick={() => { setRespondDialog({ transfer: tr, action: 'decline' }); setResponseNote('') }}>
                        Decline
                      </MutationButton>
                      <MutationButton size="small" color="success" variant="contained"
                        onClick={() => { setRespondDialog({ transfer: tr, action: 'accept' }); setResponseNote('') }}>
                        Accept
                      </MutationButton>
                    </Stack>
                  }
                >
                  <Typography variant="body2" fontWeight={600}>
                    {tr.fromRig.operator.name} → {tr.toOperator.name}
                  </Typography>
                  <Typography variant="body2">{summary}</Typography>
                  {tr.note && <Typography variant="caption" color="text.secondary">&ldquo;{tr.note}&rdquo;</Typography>}
                </Alert>
              )
            })}
          </Stack>
        </Box>
      )}

      <Stack direction="row" spacing={1.5} mb={2.5} alignItems="center" flexWrap="wrap">
        <TextField select size="small" label="All Operators" value={filterOperator}
          onChange={(e) => setFilterOperator(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">All Operators</MenuItem>
          {operators.filter((o) => o.role === 'OPERATOR').map((o) => (
            <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
          ))}
        </TextField>
        {projects.length > 0 && (
          <TextField select size="small" label="All Projects" value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="">All Projects</MenuItem>
            {projects.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
        )}
        <FormControlLabel
          control={<Switch checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} size="small" />}
          label={<Typography variant="body2">Show ended</Typography>}
        />
      </Stack>

      <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 600, color: 'text.secondary', fontSize: 12 } }}>
              <TableCell>OPERATOR</TableCell>
              <TableCell>VEHICLES</TableCell>
              <TableCell>KIT ITEMS</TableCell>
              <TableCell>PROJECT</TableCell>
              <TableCell>STARTED</TableCell>
              <TableCell align="right">ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton width={100} /></TableCell>)}</TableRow>
                ))
              : rigs.map((rig) => {
                  const kitItems = rig.kits.flatMap((k) => k.items)
                  return (
                    <TableRow key={rig.id} hover sx={{ cursor: 'pointer', '&:last-child td': { border: 0 } }} onClick={() => { setDrawerAction(null); setDrawerRig(rig) }}>
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: 'primary.main' }}>{initials(rig.operator.name)}</Avatar>
                          <Typography variant="body2">{rig.operator.name}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{rig.vehicles.length === 0 ? '—' : rig.vehicles.map((rv) => rv.vehicle.name).join(', ')}</Typography>
                      </TableCell>
                      <TableCell>
                        <Tooltip title={kitItems.map((ki) => ki.item.name).join(', ')} arrow>
                          <Typography variant="body2">{kitItems.length === 0 ? '—' : `${kitItems.length} item${kitItems.length !== 1 ? 's' : ''}`}</Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell><Typography variant="body2">{rig.project?.name ?? '—'}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{relativeDate(rig.startedAt)}</Typography></TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <EditGuard>
                            <Tooltip title="Transfer">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={!!rig.endedAt}
                                  onClick={(e) => { e.stopPropagation(); setDrawerAction('transfer'); setDrawerRig(rig) }}
                                >
                                  <SwapHorizIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </EditGuard>
                          <EditGuard>
                            <Tooltip title="End deployment">
                              <span>
                                <IconButton
                                  size="small"
                                  color="error"
                                  disabled={!!rig.endedAt}
                                  onClick={(e) => { e.stopPropagation(); setDrawerAction('end'); setDrawerRig(rig) }}
                                >
                                  <StopCircleIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </EditGuard>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )
                })}
            {!loading && rigs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  {showEnded ? 'No ended deployments.' : 'No active deployments. Click "New Deployment" to start one.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {drawerRig && (
        <DeploymentDrawer
          rig={drawerRig}
          operators={operators}
          vehicles={vehicles}
          inventoryItems={inventoryItems}
          hubs={hubs}
          initialAction={drawerAction}
          onClose={() => { setDrawerRig(null); setDrawerAction(null) }}
          onUpdated={load}
          showToast={showToast}
        />
      )}

      {newOpen && (
        <NewDeploymentDialog
          operators={operators.filter((o) => o.role === 'OPERATOR')}
          vehicles={vehicles}
          inventoryItems={inventoryItems}
          hubs={hubs}
          onClose={() => setNewOpen(false)}
          onSuccess={() => { showToast('Deployment created'); load() }}
        />
      )}

      {/* Accept / Decline respond dialog */}
      <Dialog open={!!respondDialog} onClose={() => setRespondDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{respondDialog?.action === 'accept' ? 'Accept Transfer' : 'Decline Transfer'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={1.5}>
            {respondDialog?.action === 'accept'
              ? `Accept transfer from ${respondDialog.transfer.fromRig.operator.name} to ${respondDialog.transfer.toOperator.name}?`
              : `Decline transfer from ${respondDialog?.transfer.fromRig.operator.name} to ${respondDialog?.transfer.toOperator.name}?`}
          </Typography>
          <TextField
            label="Response note (optional)"
            value={responseNote}
            onChange={(e) => setResponseNote(e.target.value)}
            multiline rows={2} fullWidth
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRespondDialog(null)} disabled={respondLoading}>Cancel</Button>
          <MutationButton
            variant="contained"
            color={respondDialog?.action === 'accept' ? 'success' : 'error'}
            onClick={handleRespond}
            disabled={respondLoading}
            startIcon={respondLoading ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {respondLoading ? 'Saving…' : respondDialog?.action === 'accept' ? 'Accept' : 'Decline'}
          </MutationButton>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
