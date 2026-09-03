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

export interface HubOption {
  id: string
  name: string
  city: string
  state: string
}

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
}

export function DispositionDialog({
  open,
  mode,
  deploymentId,
  operators,
  hubs,
  items,
  onComplete,
  onClose,
  presets,
}: DispositionDialogProps) {
  const [dispositions, setDispositions] = React.useState<Map<string, ItemDisposition>>(() => {
    const m = new Map<string, ItemDisposition>()
    for (const item of items) {
      m.set(item.kitItemId, { kitItemId: item.kitItemId, type: 'HUB', photoUrls: [] })
    }
    return m
  })
  const [note, setNote] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // G1: rig-level final destination. Every "Return to Hub" item must land in a
  // real hub — otherwise the server skips the per-hub stock credit and the
  // quantity vanishes from hub views ("disappeared"/"HQ"). Default to the first
  // hub; the per-item picker can override.
  const [finalHubId, setFinalHubId] = React.useState('')
  const { mutate, isOffline } = useOfflineQueue()

  // Reset state when dialog opens with new items
  React.useEffect(() => {
    if (open) {
      const defaultHub = hubs[0]?.id ?? ''
      const m = new Map<string, ItemDisposition>()
      for (const item of items) {
        m.set(item.kitItemId, { kitItemId: item.kitItemId, type: 'HUB', hubId: defaultHub || undefined, photoUrls: [] })
      }
      setDispositions(m)
      setFinalHubId(defaultHub)
      setNote('')
      setError(null)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply the rig-level destination to every HUB item (overridable per item below).
  function applyFinalHub(hubId: string) {
    setFinalHubId(hubId)
    setDispositions((prev) => {
      const next = new Map(prev)
      for (const [k, d] of next) if (d.type === 'HUB') next.set(k, { ...d, hubId: hubId || undefined })
      return next
    })
  }

  const missingHub = Array.from(dispositions.values()).some((d) => d.type === 'HUB' && !d.hubId)
  // UXP-3 (3g) / D36: an INOPERABLE disposition used to REQUIRE ≥1 damage photo (§11.10,
  // client + server). A denied/missing camera must never block a submit, so the photo is
  // now a nudge — the server-side clauses in /items and /end are gone too.

  function setDisp(kitItemId: string, patch: Partial<ItemDisposition>) {
    setDispositions((prev) => {
      const next = new Map(prev)
      next.set(kitItemId, { ...prev.get(kitItemId)!, ...patch })
      return next
    })
  }

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    const itemDispositions = Array.from(dispositions.values())
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
        <TextField
          select
          label="Final destination (hub)"
          value={finalHubId}
          onChange={(e) => applyFinalHub(e.target.value)}
          fullWidth
          required
          disabled={hubs.length === 0}
          error={hubs.length > 0 && !finalHubId}
          helperText={hubs.length === 0
            ? 'No hubs available — add a hub before returning items here'
            : 'Where the rig returns to. Applies to every item below (override per item if needed).'}
          sx={{ mb: 3 }}
        >
          {hubs.map((h) => (
            <MenuItem key={h.id} value={h.id}>{h.name} — {h.city}, {h.state}</MenuItem>
          ))}
        </TextField>
        <Stack spacing={2} divider={<Divider />}>
          {items.map((item) => {
            const disp = dispositions.get(item.kitItemId)!
            const isConsumable = item.itemType === 'CONSUMABLE'
            const currentQty = disp.quantity ?? item.quantity
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
                <TextField
                  select
                  label="Disposition"
                  size="small"
                  value={disp.type}
                  onChange={(e) => setDisp(item.kitItemId, { type: e.target.value as DispositionType })}
                >
                  <MenuItem value="HUB">Return to Hub</MenuItem>
                  <MenuItem value="TRANSFER">Transfer to Operator</MenuItem>
                  <MenuItem value="INOPERABLE">Mark Inoperable / Damaged</MenuItem>
                </TextField>
                {/* Partial quantity for consumables */}
                {isConsumable && item.quantity > 1 && (
                  <TextField
                    label="Quantity to remove"
                    type="number"
                    size="small"
                    value={currentQty}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(item.quantity, parseInt(e.target.value) || 1))
                      setDisp(item.kitItemId, { quantity: v })
                    }}
                    inputProps={{ min: 1, max: item.quantity }}
                    helperText={currentQty < item.quantity
                      ? `${item.quantity - currentQty} will remain in kit`
                      : 'All will be removed'}
                  />
                )}
                {disp.type === 'HUB' && (
                  <TextField
                    select
                    label="Return hub"
                    size="small"
                    required
                    value={disp.hubId ?? ''}
                    error={!disp.hubId}
                    onChange={(e) => setDisp(item.kitItemId, { hubId: e.target.value || undefined })}
                    helperText={!disp.hubId ? 'Pick a hub so this item isn’t lost' : undefined}
                  >
                    {hubs.map((h) => (
                      <MenuItem key={h.id} value={h.id}>{h.name} — {h.city}, {h.state}</MenuItem>
                    ))}
                  </TextField>
                )}
                {disp.type === 'TRANSFER' && (
                  <SearchableSelect
                    label="Destination operator"
                    size="small"
                    placeholder="Select operator…"
                    value={disp.toOperatorId ?? ''}
                    onChange={(v) => setDisp(item.kitItemId, { toOperatorId: v })}
                    options={operators.map((o) => ({ value: o.id, label: o.name }))}
                  />
                )}
                {disp.type === 'INOPERABLE' && (
                  <Stack spacing={1}>
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
          disabled={loading || missingHub}
          startIcon={loading ? <CircularProgress size={16} /> : undefined}
        >
          {loading ? 'Working…' : missingHub ? 'Choose a return hub' : mode === 'end-deployment' ? 'End Deployment' : 'Return Items'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
