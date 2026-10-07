'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Stack, Chip, CircularProgress, Checkbox, TextField, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemText, ListItemIcon,
  ListSubheader, Stepper, Step, StepLabel, Alert,
} from '@mui/material'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import { QrScannerDialog, type QrResolveResult } from '@/components/shared/QrScannerDialog'
import { ProjectSelect, type ProjectSelectOption } from '@/components/shared/ProjectSelect'
import { VEHICLE_ICON } from '@/components/operator/DeploymentCards'
import { useToast } from '@/components/shared/useToast'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { newPlaceholderId } from '@/lib/offline-remap'
import { groupBy } from '@/lib/utils'
import { NOTE_PRESETS } from '@/lib/note-presets'
import { stockAvailabilityLabel } from '@/lib/stock-format'
import { VEHICLE_TYPE_ORDER, vehicleTypeLabel } from '@/lib/vehicle-types'

// UXP-3 (3d, D21): extracted move-only from app/(operator)/operator/my-deployment/page.tsx —
// the anti-regrowth rule says new builder work on my-deployment goes in NEW files, and the
// page had regrown past D21's recorded size. The page imports the dialog, its option types,
// PendingItemEntry, PickupPreset and availFor back from here. Then added: an optional
// Project pick on Build Rig (projects fetched best-effort when the dialog opens — it only
// mounts on tap, so zero idle cost; offline or a failed read simply hides the field).

// ── Types ─────────────────────────────────────────────────────────

export interface VehicleOption {
  id: string
  name: string
  type: string
  assignedOperatorId: string | null
  status: string
}

export interface InventoryOption {
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

export interface PendingItemEntry {
  itemType: 'CONSUMABLE' | 'SERIALIZED'
  quantity: number
  inventoryUnitId: string | null
  unitLabel: string | null
}

export interface UserOption {
  id: string
  name: string
  role: string
}

export interface HubOption {
  id: string
  name: string
  city: string
  state: string
}

// Returns the available stock count for display and quantity-capping.
// Serialized items use unitCounts.available (unit rows); consumables use
// availableQuantity (= InventoryItem.quantity, the stored consumable count).
export const availFor = (i: { itemType: string; unitCounts?: { available?: number } | null; availableQuantity?: number }) =>
  i.itemType === 'SERIALIZED' ? (i.unitCounts?.available ?? 0) : (i.availableQuantity ?? 0)

// ── New Deployment Dialog (operator) ──────────────────────────────

// CC-09: pre-fill data from a fulfilled reservation's awaiting-pickup surface.
export interface PickupPreset {
  requestId: string
  label: string | null
  hubId: string | null
  lines: Array<{ itemId: string; qty: number }>
}

export function NewDeploymentDialog({
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
  // UXP-3 (3d): optional project. GET /api/projects is requireAuth (operator-safe) and
  // already read by the operator requests page; a failure just leaves the picker hidden.
  const [projectId, setProjectId] = React.useState('')
  const [projects, setProjects] = React.useState<ProjectSelectOption[]>([])
  React.useEffect(() => {
    let cancelled = false
    fetch('/api/projects')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        const list = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []
        setProjects((list as ProjectSelectOption[]).filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string'))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
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
        ...(projectId && { projectId }), // UXP-3 (3d): server passthrough already existed
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
      setStep(1) // CC-32 (2.4): the kit step is now index 1 (was 2) — same screen
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
        {/* CC-32 (2.4): 4 steps → 2. The old "Details" step held one optional label and
            the old "Start" step held one optional note — two guaranteed "Next" taps
            through screens that could not block anything. The label now heads Build Rig
            and the note+presets close Build Kit. Everything else is byte-preserved:
            the UR-006 blocker alert stays on the kit step, the 409-reselect still lands
            on the kit step, and the final button behaviour is unchanged. */}
        <Stepper activeStep={step} sx={{ mb: 3, mt: 1 }}>
          <Step><StepLabel>Build Rig</StepLabel></Step>
          <Step><StepLabel>Build Kit</StepLabel></Step>
        </Stepper>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {step === 0 && (
          <Box>
            <TextField label="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth
              placeholder="e.g. TX Summer Run" sx={{ mb: 2 }} />
            <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} sx={{ mb: 2 }} />
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

        {step === 1 && (
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
                button with no explanation. CC-32 (2.4): the button now sits on this
                same step, so the alert and the thing it explains are finally adjacent. */}
            {(hasUnselectedSerialized || (hasConsumableInKit && !sourceHubId)) && (
              <Alert severity="info" sx={{ mt: 2 }}>
                Before you can start:
                {hasUnselectedSerialized && <div>• Pick a unit for each selected serialized item above.</div>}
                {hasConsumableInKit && !sourceHubId && <div>• Choose a source hub for the consumable items.</div>}
              </Alert>
            )}
            {/* CC-24: the note is optional — one-tap presets fill it, free text stays
                available, and starting no longer requires it. CC-32 (2.4): folded in
                below the UR-006 blocker alert (which must stay on this step) instead of
                owning a step of its own. */}
            <Box sx={{ mt: 3 }}>
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
              />
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        {step > 0 && <Button onClick={() => setStep((s) => s - 1)} disabled={loading}>Back</Button>}
        {step < 1 ? (
          // CC-32 (2.4): with 2 steps the only "Next" is Build Rig → Build Kit, so the
          // UR-006 gate that used to guard leaving the kit step now lives solely on the
          // final button below (unchanged) — the note step it was protecting is gone.
          <Button variant="contained" onClick={() => setStep((s) => s + 1)} disabled={loading}>
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
