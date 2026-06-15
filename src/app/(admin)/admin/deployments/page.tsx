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
import { NotePhotoDialog } from '@/components/shared/NotePhotoDialog'
import { DispositionDialog } from '@/components/shared/DispositionDialog'
import type { HubOption, UserOption } from '@/components/shared/DispositionDialog'

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
  vehicle: { id: string; name: string; type: string }
}

interface KitItemRow {
  id: string
  quantity: number
  item: { id: string; name: string; category: { name: string } }
}

interface KitRow {
  id: string
  items: KitItemRow[]
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
  status: string
  category: { name: string }
  itemType: string
}

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

// ── Transfer Dialog ───────────────────────────────────────────────

function TransferDialog({
  rig, operators, onClose, onSuccess, showToast,
}: {
  rig: Rig
  operators: UserOption[]
  onClose: () => void
  onSuccess: () => void
  showToast: (msg: string) => void
}) {
  const [step, setStep] = React.useState(0)
  const [toOperatorId, setToOperatorId] = React.useState('')
  const [selVehicles, setSelVehicles] = React.useState<Set<string>>(new Set(rig.vehicles.map((rv) => rv.vehicle.id)))
  const [selKitItems, setSelKitItems] = React.useState<Set<string>>(new Set(rig.kits.flatMap((k) => k.items.map((ki) => ki.id))))
  const [loading, setLoading] = React.useState(false)
  const kitItems = rig.kits.flatMap((k) => k.items)

  const doTransfer = async (note: string, photoUrls: string[]) => {
    setLoading(true)
    await fetch(`/api/deployments/${rig.id}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toOperatorId, note, photoUrls, vehicleIds: Array.from(selVehicles), kitItemIds: Array.from(selKitItems) }),
    })
    setLoading(false)
    showToast(`Transfer request sent — waiting for ${operators.find((o) => o.id === toOperatorId)?.name ?? 'operator'} to accept.`)
    onSuccess()
    onClose()
  }

  if (step === 2) {
    return (
      <NotePhotoDialog
        title="Transfer equipment"
        description={`Transferring to ${operators.find((o) => o.id === toOperatorId)?.name ?? 'operator'}`}
        open={true} loading={loading} onClose={onClose} onConfirm={doTransfer} confirmLabel="Transfer"
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
          <TextField select label="Destination Operator" value={toOperatorId} onChange={(e) => setToOperatorId(e.target.value)} fullWidth>
            {operators.filter((o) => o.id !== rig.operator.id).map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
            ))}
          </TextField>
        )}
        {step === 1 && (
          <Stack spacing={2}>
            {rig.vehicles.length > 0 && (
              <Box>
                <Typography variant="subtitle2" fontWeight={600} mb={1}>Vehicles</Typography>
                <Stack spacing={0.5}>
                  {rig.vehicles.map((rv) => {
                    const Icon = VEHICLE_ICON[rv.vehicle.type] ?? LocalShippingIcon
                    return (
                      <Stack key={rv.vehicle.id} direction="row" alignItems="center" spacing={1}>
                        <Checkbox size="small" checked={selVehicles.has(rv.vehicle.id)}
                          onChange={(e) => { const s = new Set(selVehicles); e.target.checked ? s.add(rv.vehicle.id) : s.delete(rv.vehicle.id); setSelVehicles(s) }} />
                        <Icon fontSize="small" color="action" />
                        <Typography variant="body2">{rv.vehicle.name}</Typography>
                      </Stack>
                    )
                  })}
                </Stack>
              </Box>
            )}
            {kitItems.length > 0 && (
              <Box>
                <Typography variant="subtitle2" fontWeight={600} mb={1}>Kit Items</Typography>
                <Stack spacing={0.5}>
                  {kitItems.map((ki) => (
                    <Stack key={ki.id} direction="row" alignItems="center" spacing={1}>
                      <Checkbox size="small" checked={selKitItems.has(ki.id)}
                        onChange={(e) => { const s = new Set(selKitItems); e.target.checked ? s.add(ki.id) : s.delete(ki.id); setSelKitItems(s) }} />
                      <Typography variant="body2">{ki.item.name}</Typography>
                      <Typography variant="caption" color="text.secondary">×{ki.quantity}</Typography>
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
        <Button variant="contained" onClick={() => setStep((s) => s + 1)} disabled={step === 0 && !toOperatorId}>
          {step < 1 ? 'Next' : 'Continue to Note'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── New Deployment Dialog ─────────────────────────────────────────

function NewDeploymentDialog({
  operators, vehicles, inventoryItems, onClose, onSuccess,
}: {
  operators: UserOption[]
  vehicles: VehicleOption[]
  inventoryItems: InventoryOption[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [step, setStep] = React.useState(0)
  const [operatorId, setOperatorId] = React.useState('')
  const [projectId] = React.useState('')
  const [label, setLabel] = React.useState('')
  const [selVehicles, setSelVehicles] = React.useState<Set<string>>(new Set())
  const [kitItems, setKitItems] = React.useState<Map<string, number>>(new Map())
  const [note, setNote] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  const unassignedVehicles = vehicles.filter((v) => !v.assignedOperatorId && v.status !== 'RETIRED')
  const availableItems = inventoryItems.filter((i) => i.status === 'AVAILABLE')

  const launch = async () => {
    if (!note.trim()) { setError('Note is required'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/deployments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operatorId, projectId: projectId || undefined, label: label || undefined, note,
        vehicleIds: Array.from(selVehicles),
        kitItems: Array.from(kitItems.entries()).map(([inventoryItemId, quantity]) => ({ inventoryItemId, quantity })),
      }),
    })
    setLoading(false)
    if (res.ok) { onSuccess(); onClose() }
    else { const d = await res.json(); setError(d.error?.formErrors?.[0] ?? d.error ?? 'Failed') }
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
              <List dense>
                {unassignedVehicles.map((v) => {
                  const Icon = VEHICLE_ICON[v.type] ?? LocalShippingIcon
                  return (
                    <ListItem key={v.id} disablePadding>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Checkbox size="small" checked={selVehicles.has(v.id)}
                          onChange={(e) => { const s = new Set(selVehicles); e.target.checked ? s.add(v.id) : s.delete(v.id); setSelVehicles(s) }} />
                      </ListItemIcon>
                      <ListItemIcon sx={{ minWidth: 32 }}><Icon fontSize="small" /></ListItemIcon>
                      <ListItemText primary={v.name} secondary={v.type} />
                    </ListItem>
                  )
                })}
              </List>
            )}
            {selVehicles.size === 0 && <Alert severity="warning" sx={{ mt: 1 }}>At least one vehicle is recommended</Alert>}
          </Box>
        )}
        {step === 2 && (
          <Box>
            <Typography variant="body2" color="text.secondary" mb={2}>Select items to pack into this kit</Typography>
            {availableItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No available items.</Typography>
            ) : (
              <Stack spacing={1}>
                {availableItems.map((item) => {
                  const qty = kitItems.get(item.id) ?? 0
                  return (
                    <Stack key={item.id} direction="row" alignItems="center" spacing={1}>
                      <Checkbox size="small" checked={qty > 0}
                        onChange={(e) => { const m = new Map(kitItems); e.target.checked ? m.set(item.id, 1) : m.delete(item.id); setKitItems(m) }} />
                      <Box flexGrow={1}>
                        <Typography variant="body2">{item.name}</Typography>
                        <Chip size="small" label={item.category.name} sx={{ height: 16, fontSize: 10, mt: 0.25 }} />
                      </Box>
                      {qty > 0 && (
                        <TextField type="number" size="small" value={qty}
                          onChange={(e) => { const m = new Map(kitItems); m.set(item.id, parseInt(e.target.value) || 1); setKitItems(m) }}
                          inputProps={{ min: 1, style: { MozAppearance: 'textfield', width: 60 } }}
                          sx={{ width: 80, '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': { display: 'none' } }} />
                      )}
                    </Stack>
                  )
                })}
              </Stack>
            )}
            {kitItems.size === 0 && <Alert severity="warning" sx={{ mt: 1 }}>Starting with empty kit</Alert>}
          </Box>
        )}
        {step === 3 && (
          <Stack spacing={2}>
            <TextField label="Deployment note (required)" value={note} onChange={(e) => setNote(e.target.value)}
              multiline rows={3} fullWidth placeholder="e.g. Starting TX deployment with Truck 01 and Christie Drill kit" required />
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        {step > 0 && <Button onClick={() => setStep((s) => s - 1)} disabled={loading}>Back</Button>}
        {step < 3 ? (
          <Button variant="contained" onClick={() => setStep((s) => s + 1)} disabled={step === 0 && !operatorId}>Next</Button>
        ) : (
          <Button variant="contained" onClick={launch} disabled={!note.trim() || loading}
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
  rig: initialRig, operators, vehicles, inventoryItems, hubs, onClose, onUpdated, showToast,
}: {
  rig: Rig
  operators: UserOption[]
  vehicles: VehicleOption[]
  inventoryItems: InventoryOption[]
  hubs: HubOption[]
  onClose: () => void
  onUpdated: () => void
  showToast: (msg: string) => void
}) {
  const [rig, setRig] = React.useState(initialRig)
  const [removingVehicles, setRemovingVehicles] = React.useState(false)
  const [selVehicles, setSelVehicles] = React.useState<Set<string>>(new Set())
  const [removingItems, setRemovingItems] = React.useState(false)
  const [selItems, setSelItems] = React.useState<Set<string>>(new Set())
  const [addVehicleOpen, setAddVehicleOpen] = React.useState(false)
  const [pendingVehicles, setPendingVehicles] = React.useState<Set<string>>(new Set())
  const [addItemOpen, setAddItemOpen] = React.useState(false)
  const [pendingItems, setPendingItems] = React.useState<Map<string, number>>(new Map())
  const [noteDialog, setNoteDialog] = React.useState<null | 'addVehicles' | 'removeVehicles' | 'addItems' | 'removeItems' | 'end'>(null)
  const [actionLoading, setActionLoading] = React.useState(false)
  const [transferOpen, setTransferOpen] = React.useState(false)
  const [pendingTransfers, setPendingTransfers] = React.useState<TransferRow[]>([])
  const [cancelTransferId, setCancelTransferId] = React.useState<string | null>(null)
  const [cancelLoading, setCancelLoading] = React.useState(false)

  React.useEffect(() => { setRig(initialRig) }, [initialRig])

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
  const availableItems = inventoryItems.filter((i) => i.status === 'AVAILABLE')
  const isActive = !rig.endedAt

  const refresh = async () => {
    const res = await fetch(`/api/deployments/${rig.id}`)
    if (res.ok) { const d = await res.json(); setRig(d) }
    await loadTransfers()
    onUpdated()
  }

  const handleCancelTransfer = async () => {
    if (!cancelTransferId) return
    setCancelLoading(true)
    await fetch(`/api/transfers/${cancelTransferId}`, { method: 'DELETE' })
    setCancelLoading(false)
    setCancelTransferId(null)
    await loadTransfers()
  }

  const handleAddVehicles = async (note: string, photoUrls: string[]) => {
    setActionLoading(true)
    await fetch(`/api/deployments/${rig.id}/vehicles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicleIds: Array.from(pendingVehicles), note, photoUrls }),
    })
    setActionLoading(false)
    setNoteDialog(null)
    setAddVehicleOpen(false)
    setPendingVehicles(new Set())
    await refresh()
  }

  const handleRemoveVehicles = async (note: string, photoUrls: string[]) => {
    setActionLoading(true)
    await fetch(`/api/deployments/${rig.id}/vehicles`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicleIds: Array.from(selVehicles), note, photoUrls }),
    })
    setActionLoading(false)
    setNoteDialog(null)
    setRemovingVehicles(false)
    setSelVehicles(new Set())
    await refresh()
  }

  const handleAddItems = async (note: string, photoUrls: string[]) => {
    setActionLoading(true)
    await fetch(`/api/deployments/${rig.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: Array.from(pendingItems.entries()).map(([inventoryItemId, quantity]) => ({ inventoryItemId, quantity })),
        note, photoUrls,
      }),
    })
    setActionLoading(false)
    setNoteDialog(null)
    setAddItemOpen(false)
    setPendingItems(new Map())
    await refresh()
  }

  const selectedItems = kitItems
    .filter((ki) => selItems.has(ki.id))
    .map((ki) => ({ kitItemId: ki.id, itemId: ki.item.id, name: ki.item.name, quantity: ki.quantity }))

  const allKitItemSummaries = kitItems.map((ki) => ({
    kitItemId: ki.id, itemId: ki.item.id, name: ki.item.name, quantity: ki.quantity,
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
                          <Button size="small" color="error" onClick={() => setCancelTransferId(tr.id)}>Cancel</Button>
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
                  <Button size="small" variant="outlined" onClick={() => setAddVehicleOpen(true)}>Add Vehicles</Button>
                  {rig.vehicles.length > 0 && !removingVehicles && (
                    <Button size="small" variant="outlined" color="error" onClick={() => setRemovingVehicles(true)}>Remove</Button>
                  )}
                  {removingVehicles && selVehicles.size > 0 && (
                    <Button size="small" variant="contained" color="error" onClick={() => setNoteDialog('removeVehicles')}>
                      Remove ({selVehicles.size})
                    </Button>
                  )}
                  {removingVehicles && (
                    <Button size="small" onClick={() => { setRemovingVehicles(false); setSelVehicles(new Set()) }}>Cancel</Button>
                  )}
                </Stack>
              )}
            </Stack>
            {rig.vehicles.length === 0 ? (
              <Typography variant="body2" color="text.secondary" mb={2}>No vehicles in this rig.</Typography>
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
                  <Button size="small" variant="outlined" onClick={() => setAddItemOpen(true)}>Add Items</Button>
                  {kitItems.length > 0 && !removingItems && (
                    <Button size="small" variant="outlined" color="error" onClick={() => setRemovingItems(true)}>Remove</Button>
                  )}
                  {removingItems && selItems.size > 0 && (
                    <Button size="small" variant="contained" color="error" onClick={() => setNoteDialog('removeItems')}>
                      Remove ({selItems.size})
                    </Button>
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
                    <Typography variant="body2" flexGrow={1}>{ki.item.name}</Typography>
                    <Chip size="small" label={ki.item.category.name} sx={{ height: 18, fontSize: 10 }} />
                    <Typography variant="body2" color="text.secondary">×{ki.quantity}</Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </Box>

          {isActive && (
            <>
              <Divider />
              <Stack direction="row" spacing={1} px={3} py={2}>
                <Button variant="outlined" startIcon={<SwapHorizIcon />} onClick={() => setTransferOpen(true)}>Transfer…</Button>
                <Box flexGrow={1} />
                <Button variant="outlined" color="error" startIcon={<StopCircleIcon />} onClick={() => setNoteDialog('end')}>
                  End Deployment
                </Button>
              </Stack>
            </>
          )}
        </Box>
      </Drawer>

      {/* Add Vehicles picker */}
      <Dialog open={addVehicleOpen} onClose={() => { setAddVehicleOpen(false); setPendingVehicles(new Set()) }} maxWidth="xs" fullWidth>
        <DialogTitle>Add Vehicles</DialogTitle>
        <DialogContent>
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
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setAddVehicleOpen(false); setPendingVehicles(new Set()) }}>Cancel</Button>
          <Button variant="contained" disabled={pendingVehicles.size === 0}
            onClick={() => { setAddVehicleOpen(false); setNoteDialog('addVehicles') }}>Continue</Button>
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
              {availableItems.map((item) => {
                const qty = pendingItems.get(item.id) ?? 0
                return (
                  <Stack key={item.id} direction="row" alignItems="center" spacing={1}>
                    <Checkbox size="small" checked={qty > 0}
                      onChange={(e) => { const m = new Map(pendingItems); e.target.checked ? m.set(item.id, 1) : m.delete(item.id); setPendingItems(m) }} />
                    <Box flexGrow={1}>
                      <Typography variant="body2">{item.name}</Typography>
                      <Chip size="small" label={item.category.name} sx={{ height: 16, fontSize: 10 }} />
                    </Box>
                    {qty > 0 && (
                      <TextField type="number" size="small" value={qty}
                        onChange={(e) => { const m = new Map(pendingItems); m.set(item.id, parseInt(e.target.value) || 1); setPendingItems(m) }}
                        inputProps={{ min: 1, style: { MozAppearance: 'textfield', width: 60 } }}
                        sx={{ width: 80, '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': { display: 'none' } }} />
                    )}
                  </Stack>
                )
              })}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setAddItemOpen(false); setPendingItems(new Map()) }}>Cancel</Button>
          <Button variant="contained" disabled={pendingItems.size === 0}
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
      <NotePhotoDialog
        open={noteDialog === 'removeVehicles'}
        title={`Remove ${selVehicles.size} vehicle(s) from rig`}
        loading={actionLoading}
        onClose={() => setNoteDialog(null)}
        onConfirm={handleRemoveVehicles}
        confirmLabel="Remove Vehicles"
        confirmColor="error"
      />
      <NotePhotoDialog
        open={noteDialog === 'addItems'}
        title="Add items to kit"
        loading={actionLoading}
        onClose={() => setNoteDialog(null)}
        onConfirm={handleAddItems}
        confirmLabel="Add Items"
      />

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
        <TransferDialog rig={rig} operators={operators} onClose={() => setTransferOpen(false)} onSuccess={refresh} showToast={showToast} />
      )}

      {/* Cancel transfer confirm */}
      <Dialog open={!!cancelTransferId} onClose={() => setCancelTransferId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel Transfer</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to cancel this pending transfer?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCancelTransferId(null)} disabled={cancelLoading}>Keep</Button>
          <Button variant="contained" color="error" onClick={handleCancelTransfer} disabled={cancelLoading}
            startIcon={cancelLoading ? <CircularProgress size={16} color="inherit" /> : null}>
            {cancelLoading ? 'Cancelling…' : 'Cancel Transfer'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────

export default function AdminDeploymentsPage() {
  const [rigs, setRigs] = React.useState<Rig[]>([])
  const [loading, setLoading] = React.useState(true)
  const [toast, setToast] = React.useState('')
  const [showEnded, setShowEnded] = React.useState(false)
  const [filterOperator, setFilterOperator] = React.useState('')
  const [operators, setOperators] = React.useState<UserOption[]>([])
  const [vehicles, setVehicles] = React.useState<VehicleOption[]>([])
  const [inventoryItems, setInventoryItems] = React.useState<InventoryOption[]>([])
  const [hubs, setHubs] = React.useState<HubOption[]>([])
  const [drawerRig, setDrawerRig] = React.useState<Rig | null>(null)
  const [newOpen, setNewOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ active: showEnded ? 'false' : 'true' })
    if (filterOperator) params.set('operatorId', filterOperator)
    const res = await fetch(`/api/deployments?${params}`)
    if (res.ok) setRigs(await res.json())
    setLoading(false)
  }, [showEnded, filterOperator])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    fetch('/api/users').then((r) => r.json()).then((d) => setOperators(d.data ?? [])).catch(() => {})
    fetch('/api/vehicles').then((r) => r.json()).then((d) => setVehicles(d.data ?? d ?? [])).catch(() => {})
    fetch('/api/inventory?pageSize=200').then((r) => r.json()).then((d) => setInventoryItems(d.data ?? [])).catch(() => {})
    fetch('/api/hubs').then((r) => r.json()).then((d) => setHubs(d ?? [])).catch(() => {})
  }, [])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000) }
  const activeCount = rigs.filter((r) => !r.endedAt).length

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5">Deployments</Typography>
          <Typography variant="body2" color="text.secondary">{activeCount} active</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewOpen(true)}>
          New Deployment
        </Button>
      </Stack>

      {toast && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setToast('')}>{toast}</Alert>}

      <Stack direction="row" spacing={1.5} mb={2.5} alignItems="center" flexWrap="wrap">
        <TextField select size="small" label="All Operators" value={filterOperator}
          onChange={(e) => setFilterOperator(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">All Operators</MenuItem>
          {operators.filter((o) => o.role === 'OPERATOR').map((o) => (
            <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
          ))}
        </TextField>
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
                    <TableRow key={rig.id} hover sx={{ cursor: 'pointer', '&:last-child td': { border: 0 } }} onClick={() => setDrawerRig(rig)}>
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
                          <Tooltip title="Transfer">
                            <span><IconButton size="small" disabled={!!rig.endedAt}><SwapHorizIcon fontSize="small" /></IconButton></span>
                          </Tooltip>
                          <Tooltip title="End">
                            <span>
                              <IconButton size="small" color="error" disabled={!!rig.endedAt} onClick={() => setDrawerRig(rig)}>
                                <StopCircleIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
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
          onClose={() => setDrawerRig(null)}
          onUpdated={load}
          showToast={showToast}
        />
      )}

      {newOpen && (
        <NewDeploymentDialog
          operators={operators.filter((o) => o.role === 'OPERATOR')}
          vehicles={vehicles}
          inventoryItems={inventoryItems}
          onClose={() => setNewOpen(false)}
          onSuccess={() => { showToast('Deployment created'); load() }}
        />
      )}
    </Box>
  )
}
