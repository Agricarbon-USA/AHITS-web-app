'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Typography, Stack, Divider,
  CircularProgress, Chip,
} from '@mui/material'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { PhotoCapture } from './PhotoCapture'
import { SearchableSelect } from './SearchableSelect'
import { FIXABLE_OPTIONS, type ReturnCondition } from '@/lib/status'
import type { HubOption } from '@/lib/hub-label'
import { ReturnHubSelect } from './ReturnHubSelect'

export type { HubOption }

export interface UserOption {
  id: string
  name: string
  role: string
}

export interface KitItemSummary {
  kitItemId: string
  itemId: string
  name: string
  quantity: number
  itemType: string
  inventoryUnit: { id: string; qrCodeId: string; serialNumber: string | null; status: string } | null
  /** The hub a counted line's stock was drawn from (the "Came from" hint). */
  drawnHubId?: string | null
}

/** P1-1b (3.1): a page's kit line as the dialog takes it. */
export function toKitSummary(ki: {
  id: string
  quantity: number
  item: { id: string; name: string; itemType: string }
  inventoryUnit?: KitItemSummary['inventoryUnit']
  drawnHubId?: string | null
}): KitItemSummary {
  return {
    kitItemId: ki.id,
    itemId: ki.item.id,
    name: ki.item.name,
    quantity: ki.quantity,
    itemType: ki.item.itemType,
    inventoryUnit: ki.inventoryUnit ?? null,
    drawnHubId: ki.drawnHubId ?? null,
  }
}

/**
 * P1-1b (3.1, §0-s): what the deployment's outgoing waiting transfers hold — lines (with
 * the quantity waiting; null = the whole line) and vehicles, each with who it waits on.
 */
export type WaitingMap = {
  items: Record<string, { qty: number | null; toName: string }>
  vehicles: Record<string, { toName: string }>
}

/** Build a WaitingMap from outgoing PENDING transfers. */
export function waitingFrom(transfers: {
  status?: string
  toOperator: { name: string }
  items: { quantity: number | null; kitItem: { id: string } }[]
  vehicles: { vehicle: { id: string } }[]
}[]): WaitingMap {
  const w: WaitingMap = { items: {}, vehicles: {} }
  for (const tr of transfers) {
    if (tr.status && tr.status !== 'PENDING') continue
    for (const ti of tr.items) w.items[ti.kitItem.id] = { qty: ti.quantity, toName: tr.toOperator.name }
    for (const tv of tr.vehicles) w.vehicles[tv.vehicle.id] = { toName: tr.toOperator.name }
  }
  return w
}

type DispositionType = 'HUB' | 'TRANSFER' | 'INOPERABLE'

interface ItemDisposition {
  kitItemId: string
  type: DispositionType
  quantity?: number
  returnCondition?: ReturnCondition
  hubId?: string
  toOperatorId?: string
  canBeFixed?: boolean
  inoperableNotes?: string
  photoUrls: string[]
}

interface DispositionDialogProps {
  open: boolean
  mode: 'remove-items' | 'end-deployment'
  deploymentId: string
  currentOperatorId: string
  operators: UserOption[]
  hubs: HubOption[]
  items: KitItemSummary[]
  onComplete: () => void
  onClose: () => void
  /** CC-24: one-tap note presets shown above the (optional) overall note. */
  presets?: readonly string[]
  /** P1-1b (§0-s): gear waiting on a transfer from this deployment. */
  waiting?: WaitingMap
}

/** How a line stands against the deployment's waiting transfers (§0-s). */
type Waiting =
  | { kind: 'none' }
  | { kind: 'whole'; toName: string }
  | { kind: 'partial'; qty: number; free: number; toName: string }
  /** A legacy serialized line with no unit (API-6), only partly waiting: held, End refuses. */
  | { kind: 'held'; toName: string }

function waitingOf(item: KitItemSummary, waiting?: WaitingMap): Waiting {
  const w = waiting?.items[item.kitItemId]
  if (!w) return { kind: 'none' }
  if (w.qty == null || w.qty >= item.quantity) return { kind: 'whole', toName: w.toName }
  if (item.itemType !== 'CONSUMABLE' && !item.inventoryUnit) return { kind: 'held', toName: w.toName }
  return { kind: 'partial', qty: w.qty, free: item.quantity - w.qty, toName: w.toName }
}

/** A line that goes back to a hub (D51): Return to Hub, or damage that can be fixed. */
function needsHub(d: ItemDisposition, item: { itemType: string }): boolean {
  return d.type === 'HUB' || (d.type === 'INOPERABLE' && item.itemType !== 'CONSUMABLE' && d.canBeFixed === true)
}

/**
 * PR-3b (S-2): a unit that is not plainly checked out — reported "Out of service"
 * (In maintenance) or otherwise held — starts on "Mark Inoperable / Damaged" with
 * "can be fixed", so it is returned into repair rather than defaulted back to a hub
 * shelf as if it were fine. Everything else starts on "Return to Hub". P1-1b (D51):
 * no hub is pre-picked.
 */
function initialDisposition(item: { kitItemId: string; itemType: string; inventoryUnit: { status: string } | null }): ItemDisposition {
  // PR-6 (D-x): a consumable line (even one carrying a legacy unit, D-z) is never
  // pre-set to a damage disposition — for it that is a write-off.
  if (item.itemType !== 'CONSUMABLE' && item.inventoryUnit && item.inventoryUnit.status !== 'CHECKED_OUT') {
    return { kitItemId: item.kitItemId, type: 'INOPERABLE', canBeFixed: true, photoUrls: [] }
  }
  return { kitItemId: item.kitItemId, type: 'HUB', photoUrls: [] }
}
export function DispositionDialog({
  open,
  mode,
  deploymentId,
  currentOperatorId,
  operators,
  hubs,
  items,
  onComplete,
  onClose,
  presets,
  waiting,
}: DispositionDialogProps) {
  const [dispositions, setDispositions] = React.useState<Map<string, ItemDisposition>>(() => {
    const m = new Map<string, ItemDisposition>()
    for (const item of items) m.set(item.kitItemId, initialDisposition(item))
    return m
  })
  const [note, setNote] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // P1-1b (D51): "Return everything to" fills every line that goes to a hub, except the
  // lines whose hub the person picked on the line itself. Nothing is pre-picked.
  const [allHubId, setAllHubId] = React.useState('')
  const [pickedOnLine, setPickedOnLine] = React.useState<Set<string>>(() => new Set())
  const { mutate, isOffline } = useOfflineQueue()

  // Reset state when dialog opens with new items
  React.useEffect(() => {
    if (open) {
      const m = new Map<string, ItemDisposition>()
      for (const item of items) m.set(item.kitItemId, initialDisposition(item))
      setDispositions(m)
      setAllHubId('')
      setPickedOnLine(new Set())
      setNote('')
      setError(null)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const itemById = new Map(items.map((i) => [i.kitItemId, i]))
  /** A line that newly goes to a hub takes the all-lines hub, unless picked on the line. */
  const withAllHub = (d: ItemDisposition): ItemDisposition =>
    allHubId && !pickedOnLine.has(d.kitItemId) && needsHub(d, itemById.get(d.kitItemId) ?? { itemType: '' })
      ? { ...d, hubId: allHubId }
      : d

  // Hotfix 2026-10-25: a re-read can change the kit while this dialog is open (signal
  // returning, a drained queue). A line added since opening gets its default; a line
  // that has left is not sent.
  const current = items.map((i) => dispositions.get(i.kitItemId) ?? withAllHub(initialDisposition(i)))
  const waits = new Map(items.map((i) => [i.kitItemId, waitingOf(i, waiting)]))
  // §0-s: a wholly waiting (or held) line stays with its transfer — shown, never sent.
  const sendable = current.filter((d) => {
    const k = waits.get(d.kitItemId)?.kind
    return k !== 'whole' && k !== 'held'
  })

  const missingHub = sendable.some((d) => needsHub(d, itemById.get(d.kitItemId)!) && !d.hubId)
  const missingPerson = sendable.some((d) => d.type === 'TRANSFER' && !d.toOperatorId)
  const nothingToSend = mode === 'remove-items' && sendable.length === 0
  // D52: a transfer names someone other than the deployment's own operator.
  const people = operators.filter((o) => o.id !== currentOperatorId)
  // UXP-3 (3g) / D36: an INOPERABLE disposition used to REQUIRE ≥1 damage photo (§11.10,
  // client + server). A denied/missing camera must never block a submit, so the photo is
  // now a nudge — the server-side clauses in /items and /end are gone too.

  function setDisp(kitItemId: string, patch: Partial<ItemDisposition>) {
    setDispositions((prev) => {
      const next = new Map(prev)
      const before = prev.get(kitItemId) ?? current.find((d) => d.kitItemId === kitItemId)!
      const after = { ...before, ...patch }
      const item = itemById.get(kitItemId) ?? { itemType: '' }
      next.set(kitItemId, !needsHub(before, item) && needsHub(after, item) ? withAllHub(after) : after)
      return next
    })
  }

  function pickLineHub(kitItemId: string, hubId: string) {
    setPickedOnLine((prev) => new Set(prev).add(kitItemId))
    setDisp(kitItemId, { hubId: hubId || undefined })
  }

  function applyAllHub(hubId: string) {
    setAllHubId(hubId)
    setDispositions((prev) => {
      const next = new Map(prev)
      for (const d of current) {
        if (pickedOnLine.has(d.kitItemId) || !needsHub(d, itemById.get(d.kitItemId)!)) continue
        next.set(d.kitItemId, { ...(prev.get(d.kitItemId) ?? d), hubId: hubId || undefined })
      }
      return next
    })
  }

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    // PR-6 (D-x): a consumable's Write off goes as `type: 'INOPERABLE'` with no
    // `canBeFixed` — the wire format is unchanged; the server writes it off.
    // P1-1b: `hubId` rides only on a line that shows a hub picker, so a stale pick never
    // does (P1-1c relies on it); a partly waiting line returns at most its free part.
    const itemDispositions = sendable.map((d) => {
      const item = itemById.get(d.kitItemId)!
      const { hubId, canBeFixed, ...rest } = d
      const out: Omit<ItemDisposition, 'hubId' | 'canBeFixed'> & { hubId?: string; canBeFixed?: boolean } = { ...rest }
      if (needsHub(d, item)) out.hubId = hubId
      if (!(d.type === 'INOPERABLE' && item.itemType === 'CONSUMABLE') && canBeFixed !== undefined) out.canBeFixed = canBeFixed
      const w = waits.get(d.kitItemId)
      if (mode === 'remove-items' && w?.kind === 'partial') out.quantity = Math.min(d.quantity ?? w.free, w.free)
      return out
    })
    const url = mode === 'end-deployment'
      ? `/api/deployments/${deploymentId}/end`
      : `/api/deployments/${deploymentId}/items`
    const method = mode === 'end-deployment' ? 'POST' : 'DELETE'
    // Route through the offline queue rather than a raw fetch: if the operator
    // is offline or the network drops, the write is durably queued with an
    // idempotency key and replayed exactly once on reconnect (the /end and
    // /items routes are both wrapped in withIdempotency). Previously this used
    // a bare fetch, so ending a deployment or bulk-returning items in the field
    // — the core offline scenario — threw a network error instead of queueing.
    const result = await mutate({
      endpoint: url,
      // CC-24: send the note as-is (may be empty — the server no longer requires
      // it). Was `note || 'Returned'`, which masked "no note" with a fake one.
      body: { note, itemDispositions },
      method,
      label: mode === 'end-deployment' ? 'End deployment' : 'Return items',
      // PR-5 (U-9): a queued End/Return re-reads open screens when it applies.
      invalidates: ['deployments', 'inventory', 'vehicles', 'maintenance', 'today'],
    })
    setLoading(false)
    // mutate() returns ok:true both when the server applied the write and when
    // it was queued offline; it only returns ok:false for a server-reached
    // (4xx/5xx) rejection, which is the only case the operator must act on.
    if (!result.ok) {
      setError(result.error || 'Request failed')
      return
    }
    onComplete()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{mode === 'end-deployment' ? 'End Deployment' : 'Return / Remove Items'}</DialogTitle>
      <DialogContent>
        {presets && presets.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mb: 1, mt: 1 }} flexWrap="wrap" useFlexGap>
            {presets.map((p) => (
              <Chip key={p} label={p} size="small" variant="outlined" onClick={() => setNote(p)} />
            ))}
          </Stack>
        )}
        <TextField
          label="Overall note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          fullWidth
          multiline
          rows={2}
          sx={{ mb: 2, mt: 1 }}
        />
        {items.length > 1 && (
          <Stack sx={{ mb: 3 }}>
            <ReturnHubSelect
              hubs={hubs}
              value={allHubId}
              onChange={applyAllHub}
              label="Return everything to"
              required={false}
              helperText="Pick the hub this equipment goes back to. Applies to every item below — change any line if needed."
            />
          </Stack>
        )}
        <Stack spacing={2} divider={<Divider />}>
          {items.map((item) => {
            const disp = current.find((d) => d.kitItemId === item.kitItemId)!
            const isConsumable = item.itemType === 'CONSUMABLE'
            const w = waits.get(item.kitItemId)!
            const held = w.kind === 'whole' || w.kind === 'held'
            const maxQty = w.kind === 'partial' ? w.free : item.quantity
            const currentQty = Math.min(disp.quantity ?? maxQty, maxQty)
            return (
              <Stack key={item.kitItemId} spacing={1}>
                <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                  <Typography variant="body2" fontWeight={600}>{item.name}</Typography>
                  <Chip size="small" label={item.itemType} />
                  {item.inventoryUnit?.serialNumber && (
                    <Chip size="small" label={`S/N: ${item.inventoryUnit.serialNumber}`} variant="outlined" />
                  )}
                  {isConsumable && (
                    <Typography variant="caption" color="text.secondary">
                      In kit: {item.quantity}
                    </Typography>
                  )}
                </Stack>
                {held ? (
                  <Typography variant="body2" color="text.secondary">
                    {`Waiting on transfer to ${w.toName}`}
                    {w.kind === 'held'
                      ? ' — answer or cancel that transfer before ending.'
                      : mode === 'remove-items' ? ' — cancel that transfer first.' : ''}
                  </Typography>
                ) : (
                <>
                {w.kind === 'partial' && (
                  <Typography variant="body2" color="text.secondary">
                    {`${w.qty} waiting on transfer to ${w.toName} — the rest:`}
                  </Typography>
                )}
                <TextField
                  select
                  label="Disposition"
                  size="small"
                  value={disp.type}
                  onChange={(e) => setDisp(item.kitItemId, { type: e.target.value as DispositionType })}
                >
                  <MenuItem value="HUB">Return to Hub</MenuItem>
                  {w.kind !== 'partial' && <MenuItem value="TRANSFER">Transfer to a person</MenuItem>}
                  {/* PR-6 (D-x): a damaged consumable is written off, not repaired. */}
                  <MenuItem value="INOPERABLE">{isConsumable ? 'Write off' : 'Mark Inoperable / Damaged'}</MenuItem>
                </TextField>
                {/* Partial quantity for consumables — only mid-deployment; End returns whole lines (§0-u). */}
                {mode === 'remove-items' && isConsumable && maxQty > 1 && (
                  <TextField
                    label="Quantity to remove"
                    type="number"
                    size="small"
                    value={currentQty}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(maxQty, parseInt(e.target.value) || 1))
                      setDisp(item.kitItemId, { quantity: v })
                    }}
                    inputProps={{ min: 1, max: maxQty }}
                    helperText={currentQty < item.quantity
                      ? `${item.quantity - currentQty} will remain in kit`
                      : 'All will be removed'}
                  />
                )}
                {needsHub(disp, item) && (
                  <ReturnHubSelect
                    hubs={hubs}
                    size="small"
                    value={disp.hubId ?? ''}
                    onChange={(v) => pickLineHub(item.kitItemId, v)}
                    cameFromHubId={item.drawnHubId}
                  />
                )}
                {disp.type === 'TRANSFER' && (
                  <SearchableSelect
                    label="Person"
                    size="small"
                    placeholder="Pick a person"
                    value={disp.toOperatorId ?? ''}
                    onChange={(v) => setDisp(item.kitItemId, { toOperatorId: v })}
                    options={people.map((o) => ({ value: o.id, label: o.name }))}
                    helperText={people.length === 0 ? 'People didn’t load — you need a connection to pick a person.' : undefined}
                  />
                )}
                {disp.type === 'INOPERABLE' && (
                  <Stack spacing={1}>
                    {!isConsumable && (
                      <TextField
                        select
                        label="Can it be fixed?"
                        size="small"
                        value={disp.canBeFixed === true ? 'yes' : disp.canBeFixed === false ? 'no' : ''}
                        onChange={(e) => setDisp(item.kitItemId, { canBeFixed: e.target.value === 'yes' })}
                      >
                        {FIXABLE_OPTIONS.map((o) => (
                          <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                        ))}
                      </TextField>
                    )}
                    <TextField
                      label="Notes"
                      size="small"
                      value={disp.inoperableNotes ?? ''}
                      onChange={(e) => setDisp(item.kitItemId, { inoperableNotes: e.target.value })}
                      multiline
                      rows={2}
                    />
                    <Typography variant="caption" color="text.secondary">
                      Damage photos — add at least one if you can
                    </Typography>
                    <PhotoCapture
                      value={disp.photoUrls}
                      onChange={(photoUrls) => setDisp(item.kitItemId, { photoUrls })}
                      disabled={loading}
                    />
                  </Stack>
                )}
                </>
                )}
              </Stack>
            )
          })}
        </Stack>
        {isOffline && (
          <Typography color="text.secondary" variant="body2" mt={2}>
            You&rsquo;re offline — this will be saved on your device and synced automatically when you reconnect.
          </Typography>
        )}
        {error && (
          <Typography color="error" variant="body2" mt={2}>{error}</Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          color={mode === 'end-deployment' ? 'error' : 'primary'}
          onClick={handleSubmit}
          disabled={loading || missingHub || missingPerson || nothingToSend}
          startIcon={loading ? <CircularProgress size={16} /> : undefined}
        >
          {loading ? 'Working…' : missingHub ? 'Pick a return hub' : missingPerson ? 'Pick a person' : mode === 'end-deployment' ? 'End Deployment' : 'Return Items'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
