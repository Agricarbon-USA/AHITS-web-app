'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Typography, Stack, Divider,
  CircularProgress, Chip,
} from '@mui/material'

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
type ReturnCondition = 'GOOD' | 'IN_MAINTENANCE' | 'INOPERABLE'

interface ItemDisposition {
  kitItemId: string
  type: DispositionType
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
    try {
      const itemDispositions = Array.from(dispositions.values())
      const url = mode === 'end-deployment'
        ? `/api/deployments/${deploymentId}/end`
        : `/api/deployments/${deploymentId}/items`
      const method = mode === 'end-deployment' ? 'POST' : 'DELETE'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note || 'Returned', itemDispositions }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Request failed')
      }
      onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{mode === 'end-deployment' ? 'End Deployment' : 'Return Items'}</DialogTitle>
      <DialogContent>
        <TextField
          label="Overall note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          fullWidth
          multiline
          rows={2}
          sx={{ mb: 3, mt: 1 }}
        />
        <Stack spacing={2} divider={<Divider />}>
          {items.map((item) => {
            const disp = dispositions.get(item.kitItemId)!
            return (
              <Stack key={item.kitItemId} spacing={1}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="body2" fontWeight={600}>{item.name}</Typography>
                  <Chip size="small" label={item.itemType} />
                  {item.inventoryUnit?.serialNumber && (
                    <Chip size="small" label={`S/N: ${item.inventoryUnit.serialNumber}`} variant="outlined" />
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
                {disp.type === 'HUB' && (
                  <TextField
                    select
                    label="Hub"
                    size="small"
                    value={disp.hubId ?? ''}
                    onChange={(e) => setDisp(item.kitItemId, { hubId: e.target.value })}
                  >
                    {hubs.map((h) => (
                      <MenuItem key={h.id} value={h.id}>{h.name} — {h.city}, {h.state}</MenuItem>
                    ))}
                  </TextField>
                )}
                {disp.type === 'TRANSFER' && (
                  <TextField
                    select
                    label="Operator"
                    size="small"
                    value={disp.toOperatorId ?? ''}
                    onChange={(e) => setDisp(item.kitItemId, { toOperatorId: e.target.value })}
                  >
                    {operators.map((o) => (
                      <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
                    ))}
                  </TextField>
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
                      <MenuItem value="yes">Yes — send for repair</MenuItem>
                      <MenuItem value="no">No — write off</MenuItem>
                    </TextField>
                    <TextField
                      label="Notes"
                      size="small"
                      value={disp.inoperableNotes ?? ''}
                      onChange={(e) => setDisp(item.kitItemId, { inoperableNotes: e.target.value })}
                      multiline
                      rows={2}
                    />
                  </Stack>
                )}
              </Stack>
            )
          })}
        </Stack>
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
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : undefined}
        >
          {loading ? 'Working…' : mode === 'end-deployment' ? 'End Deployment' : 'Return Items'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
