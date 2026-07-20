'use client'

import { useState } from 'react'
import {
  Box, Stack, Typography, Button, TextField, MenuItem, CircularProgress, Tooltip,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { StatusChip } from '@/components/shared/StatusChip'

// CC-27: rebuilt on MUI + the tokens-sourced theme (was an entire parallel UNTHEMED
// design system of raw-HTML inline styles + hardcoded hex, the most visible "two apps
// in one page" spot inside admin/requests). This is a RE-SKIN, not a redesign — the
// logic, state, handlers, props, and exported interface are byte-identical to the
// pre-CC-27 component; only the render/style layer changed. Consumed by admin/requests,
// operator/requests, and the login-less s/[token] portal (all themed via root Providers).

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ChecklistLine {
  id: string
  name: string
  requestedQty: number
  itemType: string | null
  fulfillmentStatus: string
  fulfilledQty: number | null
  substitutedItemId: string | null
  substitutedName: string | null
  resolvedUnitId: string | null
  denyReason: string | null
  availableUnits: { id: string; serialNumber: string | null }[]
  substitutableItems: { id: string; name: string; availableAtHub: boolean }[]
}

export interface LineActionData {
  fulfilledQty?: number
  resolvedUnitId?: string
  substitutedItemId?: string
  denyReason?: string
}

export interface FulfillmentChecklistProps {
  lines: ChecklistLine[]
  progress: { checked: number; total: number }
  onLineAction: (
    lineId: string,
    action: 'confirm' | 'edit' | 'deny',
    data: LineActionData,
  ) => Promise<{ ok: boolean; error?: string }>
  onStage: () => Promise<{ ok: boolean; error?: string }>
  isActionable?: boolean
  stageLabel?: string
}

// ── Status vocabulary (label + themed chip color — no raw hex) ───────────────────

const STATUS_META: Record<string, { label: string; color: 'default' | 'success' | 'info' | 'error' }> = {
  PENDING:   { label: 'Pending',   color: 'default' },
  CONFIRMED: { label: 'Confirmed', color: 'success' },
  EDITED:    { label: 'Adjusted',  color: 'info' },
  DENIED:    { label: 'Denied',    color: 'error' },
}

// ── Line row ───────────────────────────────────────────────────────────────────

interface LineState {
  fulfillmentStatus: string
  fulfilledQty: number | null
  substitutedItemId: string | null
  substitutedName: string | null
  resolvedUnitId: string | null
  denyReason: string | null
}

interface LineRowProps {
  line: ChecklistLine
  lineState: LineState
  onAction: (lineId: string, action: 'confirm' | 'edit' | 'deny', data: LineActionData) => Promise<{ ok: boolean; error?: string }>
  isActionable: boolean
}

function LineRow({ line, lineState, onAction, isActionable }: LineRowProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'deny'>('view')
  const [editQty, setEditQty] = useState(line.requestedQty)
  const [editUnit, setEditUnit] = useState(lineState.resolvedUnitId ?? '')
  const [editSub, setEditSub] = useState(lineState.substitutedItemId ?? '')
  const [denyReason, setDenyReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const st = lineState.fulfillmentStatus

  const openEdit = () => {
    setEditQty(lineState.fulfilledQty ?? line.requestedQty)
    setEditUnit(lineState.resolvedUnitId ?? '')
    setEditSub(lineState.substitutedItemId ?? '')
    setError(null)
    setMode('edit')
  }

  const openDeny = () => {
    setDenyReason(lineState.denyReason ?? '')
    setError(null)
    setMode('deny')
  }

  const handleConfirm = async () => {
    setLoading(true); setError(null)
    const result = await onAction(line.id, 'confirm', {
      resolvedUnitId: line.itemType === 'SERIALIZED' ? editUnit || undefined : undefined,
    })
    setLoading(false)
    if (!result.ok) { setError(result.error ?? 'Action failed.'); return }
    setMode('view')
  }

  const handleEdit = async () => {
    setLoading(true); setError(null)
    const result = await onAction(line.id, 'edit', {
      fulfilledQty: editQty,
      resolvedUnitId: editUnit || undefined,
      substitutedItemId: editSub || undefined,
    })
    setLoading(false)
    if (!result.ok) { setError(result.error ?? 'Action failed.'); return }
    setMode('view')
  }

  const handleDeny = async () => {
    if (!denyReason.trim()) { setError('Please enter a reason.'); return }
    setLoading(true); setError(null)
    const result = await onAction(line.id, 'deny', { denyReason: denyReason.trim() })
    setLoading(false)
    if (!result.ok) { setError(result.error ?? 'Action failed.'); return }
    setMode('view')
  }

  // Delta label (requested → fulfilled) for actioned lines
  const deltaLine = (): string | null => {
    if (st === 'DENIED') return `Denied: ${lineState.denyReason ?? 'no reason given'}`
    if (st === 'CONFIRMED') return null  // as-requested, no delta to show
    if (st === 'EDITED') {
      const parts: string[] = []
      if (lineState.substitutedName) parts.push(`${line.name} → ${lineState.substitutedName}`)
      if (lineState.fulfilledQty != null && lineState.fulfilledQty !== line.requestedQty) {
        parts.push(`${line.requestedQty} → ${lineState.fulfilledQty}`)
      }
      return parts.length > 0 ? parts.join(', ') : null
    }
    return null
  }

  // When confirming a serialized item, show unit picker before confirm button
  const needsUnit = line.itemType === 'SERIALIZED' && line.availableUnits.length > 0 && st === 'PENDING'
  const canConfirmSerial = !needsUnit || !!editUnit

  const delta = deltaLine()

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', py: 1.25 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
            <Typography variant="body2" fontWeight={500}>{line.name}</Typography>
            <StatusChip label={STATUS_META[st]?.label ?? st} color={STATUS_META[st]?.color ?? 'default'} />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
            Requested: ×{line.requestedQty}
            {line.itemType === 'SERIALIZED' && ' (serialized)'}
          </Typography>
          {delta && (
            <Typography variant="caption" sx={{ display: 'block', mt: 0.25, color: st === 'DENIED' ? 'error.main' : 'info.main' }}>
              {delta}
            </Typography>
          )}
          {st === 'CONFIRMED' && (
            <Typography variant="caption" sx={{ display: 'block', mt: 0.25, color: 'success.main' }}>
              Confirmed as requested ×{lineState.fulfilledQty ?? line.requestedQty}
            </Typography>
          )}
        </Box>
        {isActionable && (
          <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
            {mode === 'view' && st === 'PENDING' && (
              <>
                {needsUnit ? (
                  // Serialized: show unit picker inline before confirm
                  <TextField
                    select
                    size="small"
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    sx={{ width: 140 }}
                  >
                    <MenuItem value="">— Pick unit —</MenuItem>
                    {line.availableUnits.map((u) => (
                      <MenuItem key={u.id} value={u.id}>#{u.serialNumber ?? u.id.slice(-6)}</MenuItem>
                    ))}
                  </TextField>
                ) : null}
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  disabled={loading || (line.itemType === 'SERIALIZED' && !canConfirmSerial)}
                  startIcon={loading ? <CircularProgress size={14} color="inherit" /> : undefined}
                  onClick={() => void handleConfirm()}
                >
                  Confirm
                </Button>
                <Button size="small" variant="contained" color="info" disabled={loading} onClick={openEdit}>Edit</Button>
                <Button size="small" variant="outlined" color="error" disabled={loading} onClick={openDeny}>Deny</Button>
              </>
            )}
            {mode === 'view' && st !== 'PENDING' && (
              <Button size="small" variant="outlined" color="inherit" disabled={loading} onClick={openEdit}>
                Change
              </Button>
            )}
          </Stack>
        )}
      </Stack>

      {/* Edit form */}
      {mode === 'edit' && (
        <Box sx={{ mt: 1.25, p: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}>
          <Stack spacing={1}>
            <TextField
              label="Quantity"
              type="number"
              size="small"
              inputProps={{ min: 1 }}
              value={editQty}
              onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value) || 1))}
              fullWidth
            />
            {line.itemType === 'SERIALIZED' && line.availableUnits.length > 0 && (
              <TextField select label="Unit" size="small" fullWidth value={editUnit} onChange={(e) => setEditUnit(e.target.value)}>
                <MenuItem value="">— None / keep current —</MenuItem>
                {line.availableUnits.map((u) => (
                  <MenuItem key={u.id} value={u.id}>#{u.serialNumber ?? u.id.slice(-6)}</MenuItem>
                ))}
              </TextField>
            )}
            {line.substitutableItems.length > 0 && (
              <TextField select label="Substitute item" size="small" fullWidth value={editSub} onChange={(e) => setEditSub(e.target.value)}>
                <MenuItem value="">— Same item —</MenuItem>
                {line.substitutableItems.map((sub) => (
                  <MenuItem key={sub.id} value={sub.id}>
                    {sub.name}{sub.availableAtHub ? ' ✓' : ' (low)'}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {error && <Typography variant="caption" color="error">{error}</Typography>}
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="contained"
                color="info"
                disabled={loading}
                startIcon={loading ? <CircularProgress size={14} color="inherit" /> : undefined}
                onClick={() => void handleEdit()}
              >
                Save
              </Button>
              <Button size="small" variant="outlined" color="inherit" disabled={loading} onClick={() => setMode('view')}>
                Cancel
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}

      {/* Deny form */}
      {mode === 'deny' && (
        <Box sx={{ mt: 1.25, p: 1.25, borderRadius: 2, bgcolor: (t) => alpha(t.palette.error.main, 0.08) }}>
          <Stack spacing={1}>
            <TextField
              label="Reason for denial"
              size="small"
              fullWidth
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="e.g. out of stock"
            />
            {error && <Typography variant="caption" color="error">{error}</Typography>}
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                color="error"
                disabled={loading}
                startIcon={loading ? <CircularProgress size={14} color="inherit" /> : undefined}
                onClick={() => void handleDeny()}
              >
                Deny
              </Button>
              <Button size="small" variant="outlined" color="inherit" disabled={loading} onClick={() => setMode('view')}>
                Cancel
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}
    </Box>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function FulfillmentChecklist({
  lines: initialLines,
  progress: initialProgress,
  onLineAction,
  onStage,
  isActionable = true,
  stageLabel = 'Stage reservation',
}: FulfillmentChecklistProps) {
  const [lineStates, setLineStates] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(
      initialLines.map((l) => [
        l.id,
        {
          fulfillmentStatus: l.fulfillmentStatus,
          fulfilledQty: l.fulfilledQty,
          substitutedItemId: l.substitutedItemId,
          substitutedName: l.substitutedName,
          resolvedUnitId: l.resolvedUnitId,
          denyReason: l.denyReason,
        },
      ]),
    ),
  )
  const [stageLoading, setStageLoading] = useState(false)
  const [stageError, setStageError] = useState<string | null>(null)

  const checked = Object.values(lineStates).filter((st) => st.fulfillmentStatus !== 'PENDING').length
  const total = initialLines.length
  const allChecked = checked === total && total > 0

  const handleLineAction = async (
    lineId: string,
    action: 'confirm' | 'edit' | 'deny',
    data: LineActionData,
  ): Promise<{ ok: boolean; error?: string }> => {
    const line = initialLines.find((l) => l.id === lineId)
    if (!line) return { ok: false, error: 'Line not found.' }

    const result = await onLineAction(lineId, action, data)
    if (!result.ok) return result

    // Optimistic update of local state
    const status: string =
      action === 'confirm' ? 'CONFIRMED' : action === 'edit' ? 'EDITED' : 'DENIED'

    setLineStates((prev) => ({
      ...prev,
      [lineId]: {
        fulfillmentStatus: status,
        fulfilledQty: action === 'deny' ? null : (data.fulfilledQty ?? (action === 'confirm' ? line.requestedQty : prev[lineId]?.fulfilledQty ?? line.requestedQty)),
        substitutedItemId: data.substitutedItemId ?? null,
        substitutedName: data.substitutedItemId
          ? (line.substitutableItems.find((s) => s.id === data.substitutedItemId)?.name ?? null)
          : null,
        resolvedUnitId: data.resolvedUnitId ?? null,
        denyReason: data.denyReason ?? null,
      },
    }))
    return { ok: true }
  }

  const handleStage = async () => {
    setStageLoading(true)
    setStageError(null)
    const result = await onStage()
    setStageLoading(false)
    if (!result.ok) setStageError(result.error ?? 'Stage failed.')
  }

  return (
    <Box>
      {/* Progress header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ py: 1, mb: 0.5, borderBottom: 2, borderColor: allChecked ? 'success.main' : 'divider' }}
      >
        <Typography variant="body2" fontWeight={600} color={allChecked ? 'success.main' : 'text.secondary'}>
          {checked} of {total} checked
        </Typography>
        {allChecked && (
          <Typography variant="caption" color="success.main">✓ Ready to stage</Typography>
        )}
      </Stack>

      {/* Line rows */}
      {initialLines.map((line) => (
        <LineRow
          key={line.id}
          line={line}
          lineState={lineStates[line.id] ?? {
            fulfillmentStatus: line.fulfillmentStatus,
            fulfilledQty: line.fulfilledQty,
            substitutedItemId: line.substitutedItemId,
            substitutedName: line.substitutedName,
            resolvedUnitId: line.resolvedUnitId,
            denyReason: line.denyReason,
          }}
          onAction={handleLineAction}
          isActionable={isActionable}
        />
      ))}

      {/* Stage button */}
      {isActionable && (
        <Box sx={{ mt: 2 }}>
          {stageError && (
            <Typography variant="body2" color="error" sx={{ mb: 1 }}>{stageError}</Typography>
          )}
          <Tooltip title={allChecked ? '' : 'Check off every item to stage'}>
            <Box component="span" sx={{ display: 'block' }}>
              <Button
                fullWidth
                size="large"
                variant="contained"
                color="primary"
                disabled={!allChecked || stageLoading}
                startIcon={stageLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
                onClick={() => void handleStage()}
              >
                {stageLabel}
              </Button>
            </Box>
          </Tooltip>
          {!allChecked && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 0.5 }}>
              Check off every item to stage
            </Typography>
          )}
        </Box>
      )}
    </Box>
  )
}
