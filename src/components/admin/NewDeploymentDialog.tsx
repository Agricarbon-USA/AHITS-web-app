'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Stack, Alert, Chip, MenuItem, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress,
  Checkbox, List, ListItem, ListItemText, ListItemIcon, Stepper, Step, StepLabel,
  useTheme, useMediaQuery,
} from '@mui/material'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import { NOTE_PRESETS } from '@/lib/note-presets'
import { VEHICLE_ICON } from '@/components/operator/DeploymentCards'
import { KitItemSelectRow, type AdminKitEntry } from '@/components/admin/KitItemSelectRow'
import { DeploymentReviewSummary } from '@/components/admin/DeploymentReviewSummary'
import { ProjectSelect, type ProjectSelectOption } from '@/components/shared/ProjectSelect'
import type { HubOption, UserOption } from '@/components/shared/DispositionDialog'

// UXP-3 (3d): extracted move-only from app/(admin)/admin/deployments/page.tsx (the D10
// demand-pull split: the first packet that materially touches the builder carves it out),
// then given what the packet asked for: a real optional Project pick on step 0 (the dead
// `useState('')` is gone — POST /api/deployments already passed projectId through), the
// review summary at the top of the Start step, and B-14 (alternativeLabel at xs so the
// fourth step label stops clipping). The page keeps the drawer and the list.

// ── Types ─────────────────────────────────────────────────────────

export interface VehicleOption {
  id: string
  name: string
  type: string
  status: string
  assignedOperatorId: string | null
}

export interface InventoryOption {
  id: string
  name: string
  itemType: 'CONSUMABLE' | 'SERIALIZED'
  quantity: number
  unitCounts: { available: number; checkedOut: number; inMaintenance: number; inoperable: number; retired: number; totalUnits: number }
  availableUnits: { id: string; serialNumber: string | null; position: number }[]
  category: { id: string; name: string }
}

// ── New Deployment Dialog ─────────────────────────────────────────

export function NewDeploymentDialog({
  operators, vehicles, inventoryItems, hubs, projects = [], onClose, onSuccess,
}: {
  operators: UserOption[]
  vehicles: VehicleOption[]
  inventoryItems: InventoryOption[]
  hubs: HubOption[]
  /** UXP-3 (3d): the page already fetches /api/projects for its filter — now plumbed in. */
  projects?: ProjectSelectOption[]
  onClose: () => void
  onSuccess: () => void
}) {
  const theme = useTheme()
  // B-14: at xs the four horizontal labels clipped "Start"; stacked labels fit.
  const stackLabels = useMediaQuery(theme.breakpoints.down('sm'))
  const [step, setStep] = React.useState(0)
  const [operatorId, setOperatorId] = React.useState('')
  const [projectId, setProjectId] = React.useState('')
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

  // Review-step read-back. kitItems is keyed by unit id (serialized) / item id (consumable),
  // so the entry counts ARE "units packed" and "consumable items packed".
  const kitEntries = Array.from(kitItems.values())
  const summary = {
    operatorName: operators.find((o) => o.id === operatorId)?.name ?? null,
    projectName: projects.find((p) => p.id === projectId)?.name ?? null,
    vehicleNames: vehicles.filter((v) => selVehicles.has(v.id)).map((v) => v.name),
    consumableCount: kitEntries.filter((e) => e.itemType === 'CONSUMABLE').length,
    serializedCount: kitEntries.filter((e) => e.itemType === 'SERIALIZED').length,
    sourceHubName: hubs.find((h) => h.id === sourceHubId)?.name ?? null,
  }

  const launch = async () => {
    // CC-24: the deployment note is optional now (server relaxed too).
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
        <Stepper activeStep={step} alternativeLabel={stackLabels} sx={{ mb: 3, mt: 1 }}>
          <Step><StepLabel>Assign</StepLabel></Step>
          <Step><StepLabel>Build Rig</StepLabel></Step>
          <Step><StepLabel>Build Kit</StepLabel></Step>
          {/* CC-32 (1.1): the retired deployment verb is gone — this step is "Start". */}
          <Step><StepLabel>Start</StepLabel></Step>
        </Stepper>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {step === 0 && (
          <Stack spacing={2}>
            <TextField select label="Operator" value={operatorId} onChange={(e) => setOperatorId(e.target.value)} fullWidth required>
              {operators.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
            </TextField>
            <TextField label="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth placeholder="e.g. TX Summer Run" />
            <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} />
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
            <DeploymentReviewSummary {...summary} />
            {/* CC-24: note optional now, with one-tap presets. */}
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {NOTE_PRESETS.map((p) => (
                <Chip key={p} label={p} size="small" variant="outlined" onClick={() => setNote(p)} />
              ))}
            </Stack>
            <TextField label="Deployment note (optional)" value={note} onChange={(e) => setNote(e.target.value)}
              multiline rows={3} fullWidth placeholder="e.g. Starting TX deployment with Truck 01 and Christie Drill kit" />
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
            {/* CC-32 (1.1): one deployment verb app-wide — matches the operator dialog. */}
            {loading ? 'Starting…' : 'Start Deployment'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
