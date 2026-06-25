'use client'

import { useState } from 'react'

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

// ── Styles ─────────────────────────────────────────────────────────────────────

const COLORS = {
  green: '#2e7d32',
  greenLight: '#e8f5e9',
  red: '#d32f2f',
  redLight: '#ffebee',
  blue: '#1565c0',
  blueLight: '#e3f2fd',
  orange: '#e65100',
  orangeLight: '#fff3e0',
  grey: '#757575',
  greyLight: '#f5f5f5',
  border: '#e0e0e0',
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  PENDING:   { bg: COLORS.greyLight,   color: COLORS.grey,   label: 'Pending' },
  CONFIRMED: { bg: COLORS.greenLight,  color: COLORS.green,  label: 'Confirmed' },
  EDITED:    { bg: COLORS.blueLight,   color: COLORS.blue,   label: 'Adjusted' },
  DENIED:    { bg: COLORS.redLight,    color: COLORS.red,    label: 'Denied' },
}

const s = {
  badge: (status: string): React.CSSProperties => {
    const st = STATUS_STYLES[status] ?? STATUS_STYLES.PENDING
    return {
      display: 'inline-block',
      background: st.bg,
      color: st.color,
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 0.3,
      textTransform: 'uppercase' as const,
    }
  },
  btn: (variant: 'confirm' | 'edit' | 'deny' | 'stage' | 'cancel'): React.CSSProperties => {
    const base: React.CSSProperties = {
      border: 'none',
      borderRadius: 6,
      padding: '6px 12px',
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      minHeight: 32,
    }
    if (variant === 'confirm') return { ...base, background: COLORS.green, color: '#fff' }
    if (variant === 'edit')    return { ...base, background: COLORS.blue, color: '#fff' }
    if (variant === 'deny')    return { ...base, background: '#fff', color: COLORS.red, border: `1px solid ${COLORS.red}` }
    if (variant === 'stage')   return { ...base, background: COLORS.green, color: '#fff', padding: '10px 20px', fontSize: 14, minHeight: 44, width: '100%' }
    return { ...base, background: '#fff', color: COLORS.grey, border: `1px solid ${COLORS.border}` }
  },
  input: (): React.CSSProperties => ({
    width: '100%',
    padding: '8px 10px',
    fontSize: 13,
    borderRadius: 6,
    border: `1px solid ${COLORS.border}`,
    minHeight: 36,
    boxSizing: 'border-box' as const,
  }),
  select: (): React.CSSProperties => ({
    width: '100%',
    padding: '7px 10px',
    fontSize: 13,
    borderRadius: 6,
    border: `1px solid ${COLORS.border}`,
    minHeight: 36,
    background: '#fff',
  }),
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

  return (
    <div style={{ borderBottom: `1px solid ${COLORS.border}`, padding: '10px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{line.name}</span>
            <span style={s.badge(st)}>{STATUS_STYLES[st]?.label ?? st}</span>
          </div>
          <div style={{ fontSize: 12, color: COLORS.grey, marginTop: 2 }}>
            Requested: ×{line.requestedQty}
            {line.itemType === 'SERIALIZED' && ' (serialized)'}
          </div>
          {deltaLine() && (
            <div style={{ fontSize: 12, color: st === 'DENIED' ? COLORS.red : COLORS.blue, marginTop: 2 }}>
              {deltaLine()}
            </div>
          )}
          {st === 'CONFIRMED' && (
            <div style={{ fontSize: 12, color: COLORS.green, marginTop: 2 }}>
              Confirmed as requested ×{lineState.fulfilledQty ?? line.requestedQty}
            </div>
          )}
        </div>
        {isActionable && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {mode === 'view' && st === 'PENDING' && (
              <>
                {needsUnit ? (
                  // Serialized: show unit picker inline before confirm
                  <select
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    style={{ ...s.select(), width: 140, fontSize: 12 }}
                  >
                    <option value="">— Pick unit —</option>
                    {line.availableUnits.map((u) => (
                      <option key={u.id} value={u.id}>#{u.serialNumber ?? u.id.slice(-6)}</option>
                    ))}
                  </select>
                ) : null}
                <button
                  style={s.btn('confirm')}
                  disabled={loading || (line.itemType === 'SERIALIZED' && !canConfirmSerial)}
                  onClick={() => void handleConfirm()}
                >
                  {loading ? '…' : 'Confirm'}
                </button>
                <button style={s.btn('edit')} disabled={loading} onClick={openEdit}>Edit</button>
                <button style={s.btn('deny')} disabled={loading} onClick={openDeny}>Deny</button>
              </>
            )}
            {mode === 'view' && st !== 'PENDING' && (
              <button style={s.btn('cancel')} disabled={loading} onClick={openEdit}>
                Change
              </button>
            )}
          </div>
        )}
      </div>

      {/* Edit form */}
      {mode === 'edit' && (
        <div style={{ marginTop: 10, padding: 10, background: COLORS.greyLight, borderRadius: 8 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div>
              <label style={{ fontSize: 12, color: COLORS.grey }}>Quantity</label>
              <input
                type="number"
                min={1}
                value={editQty}
                onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value) || 1))}
                style={s.input()}
              />
            </div>
            {line.itemType === 'SERIALIZED' && line.availableUnits.length > 0 && (
              <div>
                <label style={{ fontSize: 12, color: COLORS.grey }}>Unit</label>
                <select value={editUnit} onChange={(e) => setEditUnit(e.target.value)} style={s.select()}>
                  <option value="">— None / keep current —</option>
                  {line.availableUnits.map((u) => (
                    <option key={u.id} value={u.id}>#{u.serialNumber ?? u.id.slice(-6)}</option>
                  ))}
                </select>
              </div>
            )}
            {line.substitutableItems.length > 0 && (
              <div>
                <label style={{ fontSize: 12, color: COLORS.grey }}>Substitute item</label>
                <select value={editSub} onChange={(e) => setEditSub(e.target.value)} style={s.select()}>
                  <option value="">— Same item —</option>
                  {line.substitutableItems.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}{sub.availableAtHub ? ' ✓' : ' (low)'}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {error && <div style={{ color: COLORS.red, fontSize: 12 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={s.btn('edit')} disabled={loading} onClick={() => void handleEdit()}>
                {loading ? 'Saving…' : 'Save'}
              </button>
              <button style={s.btn('cancel')} disabled={loading} onClick={() => setMode('view')}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deny form */}
      {mode === 'deny' && (
        <div style={{ marginTop: 10, padding: 10, background: COLORS.redLight, borderRadius: 8 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div>
              <label style={{ fontSize: 12, color: COLORS.grey }}>Reason for denial</label>
              <input
                type="text"
                value={denyReason}
                onChange={(e) => setDenyReason(e.target.value)}
                placeholder="e.g. out of stock"
                style={s.input()}
              />
            </div>
            {error && <div style={{ color: COLORS.red, fontSize: 12 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={s.btn('deny')} disabled={loading} onClick={() => void handleDeny()}>
                {loading ? 'Saving…' : 'Deny'}
              </button>
              <button style={s.btn('cancel')} disabled={loading} onClick={() => setMode('view')}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
    <div>
      {/* Progress header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 0',
          marginBottom: 4,
          borderBottom: `2px solid ${allChecked ? COLORS.green : COLORS.border}`,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: allChecked ? COLORS.green : COLORS.grey }}>
          {checked} of {total} checked
        </span>
        {allChecked && (
          <span style={{ fontSize: 12, color: COLORS.green }}>✓ Ready to stage</span>
        )}
      </div>

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
        <div style={{ marginTop: 16 }}>
          {stageError && (
            <div style={{ color: COLORS.red, fontSize: 13, marginBottom: 8 }}>{stageError}</div>
          )}
          <button
            style={{
              ...s.btn('stage'),
              opacity: allChecked && !stageLoading ? 1 : 0.5,
              cursor: allChecked && !stageLoading ? 'pointer' : 'not-allowed',
            }}
            disabled={!allChecked || stageLoading}
            onClick={() => void handleStage()}
            title={allChecked ? undefined : 'Check off every item to stage'}
          >
            {stageLoading ? 'Staging…' : stageLabel}
          </button>
          {!allChecked && (
            <div style={{ fontSize: 12, color: COLORS.grey, textAlign: 'center', marginTop: 4 }}>
              Check off every item to stage
            </div>
          )}
        </div>
      )}
    </div>
  )
}
