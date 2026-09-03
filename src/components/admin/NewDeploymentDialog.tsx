'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Stack, Alert, Chip, TextField,
  Checkbox, List, ListItem, ListItemText, ListItemIcon, Stepper, Step, StepLabel,
  useTheme, useMediaQuery,
} from '@mui/material'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import { NOTE_PRESETS } from '@/lib/note-presets'
import { VEHICLE_ICON } from '@/components/operator/DeploymentCards'
import { KitItemSelectRow, type AdminKitEntry } from '@/components/admin/KitItemSelectRow'
import { DeploymentReviewSummary } from '@/components/admin/DeploymentReviewSummary'
import { EntityFormDialog, RequiredLegend, type SubmitResult } from '@/components/ui/EntityFormDialog'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { useDirtyState } from '@/hooks/useDirtyState'
import { parseApiError, apiErrorMessage } from '@/lib/api-error-shape'
import type { ProjectSelectOption } from '@/components/shared/ProjectSelect'
import type { HubOption, UserOption } from '@/components/shared/DispositionDialog'

// UXP-3 (3d): extracted move-only from app/(admin)/admin/deployments/page.tsx (the D10
// demand-pull split: the first packet that materially touches the builder carves it out),
// then given what the packet asked for: a real optional Project pick on step 0 (the dead
// `useState('')` is gone — POST /api/deployments already passed projectId through), the
// review summary at the top of the Start step, and B-14 (alternativeLabel at xs so the
// fourth step label stops clipping). The page keeps the drawer and the list.
//
// UXP-6 (6d): the builder now speaks the one create/edit grammar (EntityFormDialog):
//  - the Paper is the <form>: Enter = Next on steps 0–2 and "Start Deployment" (D11) on
//    the last; Back is the secondary action; Cancel/submit pinned; "* required" legend;
//    optional fields unmarked (no "(optional)" in labels).
//  - a half-built rig is `dirty` (useDirtyState) so backdrop / Esc / hardware Back ask
//    "Discard changes?" instead of throwing four steps of picks away.
//  - operator · project · source hub are SearchableSelects (a long roster is unusable
//    as a flat menu); hubs read `name · city, state` everywhere.
//  - T1: a 409 no longer wipes every serialized pick. The page refetches availability
//    (`onRefetchPickers`) and only the picks whose unit/vehicle is gone are dropped —
//    named in the form error; consumables and unaffected units stay. The operator-has-
//    active-rig / insufficient-stock 409s drop nothing (everything is still available)
//    and just show the server's message.
//  - T2: the same refetch runs after every successful create, so a second deployment
//    in one sitting never offers a just-assigned unit or vehicle.

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

/** What the two pickers select from; the page refetches these after every create / 409. */
export interface PickerData {
  vehicles: VehicleOption[]
  inventoryItems: InventoryOption[]
}

/** The created rig as POST /api/deployments returns it (only the parts the page reads). */
export interface CreatedRig {
  id: string
  label?: string | null
  startedAt?: string
  endedAt?: string | null
  operator?: { id: string; name: string }
  project?: { id: string; name: string } | null
  vehicles?: unknown[]
  kits?: unknown[]
  secondaryOperators?: unknown[]
}

export interface StartedDeployment {
  /** The response body, or null when it was unreadable — the page still toasts. */
  rig: CreatedRig | null
  operatorId: string
  operatorName: string
}

// ── Helpers (exported for the drawer's Add Items and for tests) ───

/** One hub label everywhere: `name · city, state` (plan §2). */
export function hubLabel(h: { name: string; city?: string | null; state?: string | null }): string {
  if (!h.city) return h.name
  return `${h.name} · ${h.city}${h.state ? `, ${h.state}` : ''}`
}

/** A vehicle the builder may offer: not on a rig, not retired. */
export function isPickableVehicle(v: VehicleOption): boolean {
  return !v.assignedOperatorId && v.status !== 'RETIRED'
}

/** Consumables show when quantity > 0; serialized when at least one unit is available. */
export function isPickableItem(i: InventoryOption): boolean {
  return i.itemType === 'SERIALIZED' ? i.unitCounts.available > 0 : i.quantity > 0
}

/** The "Unit 3 of Corer" / "GPS-007 of GPS unit" name of a serialized pick. */
export function unitPickLabel(entry: Extract<AdminKitEntry, { itemType: 'SERIALIZED' }>): string {
  return `${entry.unitLabel} of ${entry.itemName}`
}

/** One review line per pick: "Sample bags ×2", "GPS unit · GPS-007". */
export function kitEntryLine(entry: AdminKitEntry): string {
  return entry.itemType === 'CONSUMABLE'
    ? `${entry.itemName} ×${entry.quantity}`
    : `${entry.itemName} · ${entry.unitLabel}`
}

export interface DroppedPicks {
  /** Serialized picks whose unit is no longer available, as "Unit 3 of Corer". */
  units: string[]
  /** Vehicle picks no longer free, by name. */
  vehicles: string[]
}

/**
 * T1 — scoped 409 recovery. Given the picks and FRESH availability, keep every pick
 * that is still available and drop only the ones that are not: a serialized unit no
 * longer in its item's `availableUnits`, a vehicle now assigned/retired/gone.
 * Consumables are never dropped (an insufficient-stock 409 is a quantity problem the
 * admin fixes by hand, not a lost pick). Pure; the caller decides what to show.
 */
export function dropUnavailablePicks(
  picks: { kitItems: Map<string, AdminKitEntry>; vehicleIds: Set<string> },
  fresh: PickerData,
  previousVehicles: VehicleOption[] = [],
): { kitItems: Map<string, AdminKitEntry>; vehicleIds: Set<string>; dropped: DroppedPicks } {
  const availableUnitIds = new Set<string>()
  for (const item of fresh.inventoryItems) for (const u of item.availableUnits) availableUnitIds.add(u.id)

  const kitItems = new Map<string, AdminKitEntry>()
  const dropped: DroppedPicks = { units: [], vehicles: [] }
  for (const [key, entry] of picks.kitItems) {
    if (entry.itemType === 'SERIALIZED' && !availableUnitIds.has(entry.inventoryUnitId)) {
      dropped.units.push(unitPickLabel(entry))
      continue
    }
    kitItems.set(key, entry)
  }

  const vehicleIds = new Set<string>()
  for (const id of picks.vehicleIds) {
    const now = fresh.vehicles.find((v) => v.id === id)
    if (now && isPickableVehicle(now)) { vehicleIds.add(id); continue }
    dropped.vehicles.push(now?.name ?? previousVehicles.find((v) => v.id === id)?.name ?? id)
  }
  return { kitItems, vehicleIds, dropped }
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The form-level message naming what a 409 recovery dropped, or null when nothing was. */
export function droppedPicksMessage(dropped: DroppedPicks): string | null {
  const parts: string[] = []
  if (dropped.units.length > 0) {
    parts.push(`${joinNames(dropped.units)} ${dropped.units.length === 1 ? 'was' : 'were'} taken — removed from your kit.`)
  }
  if (dropped.vehicles.length > 0) {
    parts.push(`${joinNames(dropped.vehicles)} ${dropped.vehicles.length === 1 ? 'is' : 'are'} now on another deployment — removed from your rig.`)
  }
  return parts.length > 0 ? parts.join(' ') : null
}

/** The wire shape POST /api/deployments (and the drawer's items POST) expect. */
export function kitEntryToPayload(entry: AdminKitEntry) {
  return entry.itemType === 'SERIALIZED'
    ? { inventoryItemId: entry.inventoryItemId, inventoryUnitId: entry.inventoryUnitId, itemType: 'SERIALIZED' as const }
    : { inventoryItemId: entry.inventoryItemId, quantity: entry.quantity }
}

const STEPS = ['Assign', 'Build Rig', 'Build Kit', 'Start'] as const
const LAST_STEP = STEPS.length - 1
const START_FALLBACK = 'Could not start the deployment. Please try again.'

// ── New Deployment Dialog ─────────────────────────────────────────

export function NewDeploymentDialog({
  operators, vehicles, inventoryItems, hubs, projects = [], onClose, onSuccess, onRefetchPickers,
}: {
  operators: UserOption[]
  vehicles: VehicleOption[]
  inventoryItems: InventoryOption[]
  hubs: HubOption[]
  /** UXP-3 (3d): the page already fetches /api/projects for its filter — now plumbed in. */
  projects?: ProjectSelectOption[]
  onClose: () => void
  onSuccess: (started: StartedDeployment) => void
  /**
   * UXP-6 (6d, T1/T2): re-read vehicles + inventory and return the fresh lists (null on
   * failure). Called after every 409 (to keep only still-available picks) and after
   * every successful create (so the next deployment never offers a taken unit).
   */
  onRefetchPickers?: () => Promise<PickerData | null>
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
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})

  // The dialog is mounted per open, so the snapshot is taken on mount.
  const dirty = useDirtyState(true, { operatorId, projectId, label, selVehicles, kitItems, sourceHubId, note })

  const unassignedVehicles = vehicles.filter(isPickableVehicle)
  const availableItems = inventoryItems.filter(isPickableItem)
  const hasConsumableInKit = Array.from(kitItems.values()).some((e) => e.itemType === 'CONSUMABLE')
  // Block the kit step (and the launch) when a consumable is packed but no source hub is chosen.
  const hasUnresolved = hasConsumableInKit && !sourceHubId

  const operatorName = operators.find((o) => o.id === operatorId)?.name ?? null

  // Review-step read-back. kitItems is keyed by unit id (serialized) / item id (consumable),
  // so the entry counts ARE "units packed" and "consumable items packed".
  const kitEntries = Array.from(kitItems.values())
  const summary = {
    operatorName,
    projectName: projects.find((p) => p.id === projectId)?.name ?? null,
    vehicleNames: vehicles.filter((v) => selVehicles.has(v.id)).map((v) => v.name),
    consumableCount: kitEntries.filter((e) => e.itemType === 'CONSUMABLE').length,
    serializedCount: kitEntries.filter((e) => e.itemType === 'SERIALIZED').length,
    sourceHubName: hubs.find((h) => h.id === sourceHubId)?.name ?? null,
    kitLines: kitEntries.map(kitEntryLine),
  }

  const launch = async () => {
    // CC-24: the deployment note is optional now (server relaxed too).
    setLoading(true); setError(null); setFieldErrors({})
    let res: Response
    try {
      res = await fetch('/api/deployments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatorId, projectId: projectId || undefined, label: label || undefined, note,
          sourceHubId: sourceHubId || undefined,
          vehicleIds: Array.from(selVehicles),
          kitItems: Array.from(kitItems.values()).map(kitEntryToPayload),
        }),
      })
    } catch {
      setLoading(false)
      setError('Network error. Please try again.')
      return
    }
    const body: unknown = await res.json().catch(() => null)
    if (res.ok) {
      setLoading(false)
      // T2: the next builder must not offer what this one just took.
      void onRefetchPickers?.()
      const rig = body && typeof body === 'object' && typeof (body as CreatedRig).id === 'string' ? (body as CreatedRig) : null
      onSuccess({ rig, operatorId, operatorName: operatorName ?? 'the operator' })
      onClose()
      return
    }
    if (res.status === 409 && onRefetchPickers) {
      // T1: keep every pick that is still available; drop only the ones that are not.
      const fresh = await onRefetchPickers()
      if (fresh) {
        const next = dropUnavailablePicks({ kitItems, vehicleIds: selVehicles }, fresh, vehicles)
        const msg = droppedPicksMessage(next.dropped)
        if (msg) {
          setKitItems(next.kitItems)
          setSelVehicles(next.vehicleIds)
          setError(msg)
          setLoading(false)
          return
        }
      }
      // Nothing of ours went away (operator already deployed, hub stock short, …):
      // every pick stays and the server's message speaks for itself.
    }
    setFieldErrors(parseApiError(body, START_FALLBACK).fieldErrors)
    setError(apiErrorMessage(body, START_FALLBACK))
    setLoading(false)
  }

  // Submit = Next until the last step, where it is "Start Deployment". Returning
  // `false` makes EntityFormDialog scroll to the first invalid field.
  const handleSubmit = async (): Promise<SubmitResult> => {
    if (step === 0) {
      if (!operatorId) { setFieldErrors({ operatorId: 'Choose an operator' }); return false }
      setFieldErrors({}); setStep(1); return
    }
    if (step === 1) { setStep(2); return }
    if (step === 2) {
      if (hasUnresolved) { setFieldErrors({ sourceHubId: 'Consumables are drawn from this hub.' }); return false }
      setFieldErrors({}); setStep(3); return
    }
    await launch()
  }

  const isLast = step === LAST_STEP
  const submitDisabled = (step === 0 && !operatorId) || ((step === 2 || isLast) && hasUnresolved)
  const showLegend = step === 0 || (step === 2 && hasConsumableInKit)

  return (
    <EntityFormDialog
      open
      title="Start Deployment"
      onClose={onClose}
      onSubmit={handleSubmit}
      saving={loading}
      submitLabel={isLast ? 'Start Deployment' : 'Next'}
      savingLabel="Starting…"
      submitDisabled={submitDisabled}
      dirty={dirty}
      formError={error}
      legend={showLegend ? <RequiredLegend /> : undefined}
      secondaryAction={step > 0 ? (
        <Button onClick={() => setStep((s) => s - 1)} disabled={loading}>Back</Button>
      ) : undefined}
      fullScreenXs
    >
      <Stepper activeStep={step} alternativeLabel={stackLabels} sx={{ mb: 3, mt: 1 }}>
        {STEPS.map((s) => <Step key={s}><StepLabel>{s}</StepLabel></Step>)}
      </Stepper>
      {step === 0 && (
        <Stack spacing={2}>
          <SearchableSelect
            label="Operator"
            value={operatorId}
            onChange={(v) => { setOperatorId(v); if (v) setFieldErrors((f) => ({ ...f, operatorId: '' })) }}
            options={operators.map((o) => ({ value: o.id, label: o.name }))}
            required
            error={!!fieldErrors.operatorId}
            helperText={fieldErrors.operatorId || undefined}
          />
          <TextField label="Label" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth placeholder="e.g. TX Summer Run" />
          {projects.length > 0 && (
            <SearchableSelect
              label="Project"
              value={projectId}
              onChange={setProjectId}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              error={!!fieldErrors.projectId}
              helperText={fieldErrors.projectId || undefined}
            />
          )}
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
          <Box sx={{ mb: 2 }}>
            <SearchableSelect
              label="Source hub for consumables"
              value={sourceHubId}
              onChange={(v) => { setSourceHubId(v); if (v) setFieldErrors((f) => ({ ...f, sourceHubId: '' })) }}
              options={hubs.map((h) => ({ value: h.id, label: hubLabel(h) }))}
              size="small"
              required={hasConsumableInKit}
              error={hasUnresolved || !!fieldErrors.sourceHubId}
              helperText={hasConsumableInKit
                ? 'Consumables are drawn from this hub.'
                : 'Required only when the kit includes a consumable.'}
            />
          </Box>
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
          <TextField label="Deployment note" value={note} onChange={(e) => setNote(e.target.value)}
            multiline rows={3} fullWidth placeholder="e.g. Starting TX deployment with Truck 01 and Christie Drill kit" />
        </Stack>
      )}
    </EntityFormDialog>
  )
}
