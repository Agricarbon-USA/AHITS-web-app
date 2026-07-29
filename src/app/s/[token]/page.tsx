'use client'

import { useEffect, useRef, useState, use } from 'react'
import { formatDate } from '@/lib/utils'
import { FulfillmentChecklist, type ChecklistLine } from '@/components/shared/FulfillmentChecklist'
import { color, font } from '@/theme/tokens'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReservationLine {
  id: string
  name: string
  requestedQty: number
  kind: string
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

interface Subject {
  kind?: string
  taskName?: string
  asset?: string
  serialNumber?: string | null
  problem?: string | null
  shipToHub?: string | null
  photos?: string[]
  hub?: string | null
  // reservation fields
  label?: string | null
  neededBy?: string | null
  requester?: string | null
  project?: string | null
  progress?: { checked: number; total: number }
  lines?: ReservationLine[]
}

interface Context {
  type: 'WORK_ORDER' | 'HUB_RETURN' | 'INVOICE' | 'RESERVATION'
  state: string
  actionable: boolean
  allowedActions: string[]
  recipientName?: string | null
  // Human label the API sends in place of subject data on a dead link (§3.4).
  label?: string | null
  subject: Subject
}

// ── Styles ────────────────────────────────────────────────────────────────────

// CC-23: this login-less external portal is intentionally raw-HTML (no MUI), but
// its palette and type are single-sourced from tokens.ts — the brand green, danger
// shade, ink, borders, and font all resolve here rather than being re-hardcoded.
// (CC-27 owns the full rebuild; until then the file stays on the ESLint hex allowlist.)
const wrap: React.CSSProperties = { maxWidth: 560, margin: '0 auto', padding: 24, fontFamily: font.familyPortal, color: color.ink }
const card: React.CSSProperties = { border: `1px solid ${color.border}`, borderRadius: 12, padding: 20, marginTop: 16, background: color.surface }
const btn: React.CSSProperties = { background: color.brand, color: color.surface, border: 'none', padding: '12px 20px', borderRadius: 8, fontWeight: font.weight.medium, fontSize: font.size.base, cursor: 'pointer', minHeight: 48, width: '100%', marginTop: 8 }
const btnOutline: React.CSSProperties = { ...btn, background: color.surface, color: color.brand, border: `1px solid ${color.brand}` }
const btnDanger: React.CSSProperties = { ...btnOutline, color: color.errorAlt, border: `1px solid ${color.errorAlt}` }
const inputStyle: React.CSSProperties = { width: '100%', padding: 12, fontSize: font.size.base, borderRadius: 8, border: `1px solid ${color.borderSoft}`, margin: '6px 0 12px', minHeight: 44, boxSizing: 'border-box' }

const ACTION_LABELS: Record<string, string> = {
  RECEIVED: 'Mark received',
  IN_PROGRESS: 'Mark in progress',
  COMPLETED: 'Mark completed',
  INVOICED: 'Submit invoice #',
  DISCREPANCY: 'Report a discrepancy',
  PAID: 'Mark paid',
  CONFIRMED: 'Confirm we can fulfill',
  PREPARED: 'Mark staged',
  DECLINED: 'Decline',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StatusLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [ctx, setCtx] = useState<Context | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actorLabel, setActorLabel] = useState('')
  const [note, setNote] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  // FND-6 final shard: a per-intent idempotency nonce keyed by (lineId, action). Minted
  // once per intent, reused for every retry/double-tap of THAT intent (so withIdempotency
  // dedups the second write), cleared on success so the NEXT intent — including editing the
  // same line to a new qty — mints a fresh key and applies. A random nonce (not a counter)
  // survives a page reload without colliding with a prior key that carried a different body.
  const lineActionNonce = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    fetch(`/api/s/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status === 404 ? 'This link was not found.' : 'Could not load this link.')))
      .then(setCtx)
      .catch((e) => setError(typeof e === 'string' ? e : 'Could not load this link.'))
      .finally(() => setLoading(false))
  }, [token])

  // Generic whole-request submit (non-reservation or decline)
  async function submit(action: string) {
    if (!actorLabel.trim()) { setError('Please enter your name first.'); return }
    setSubmitting(true); setError(null)
    try {
      const res = await fetch(`/api/s/${token}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `${token}:${action}` },
        body: JSON.stringify({ action, actorLabel, note: note || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error?.formErrors?.[0] ?? data.error ?? 'Could not submit.'); return }
      setDone(action)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div style={wrap}><p>Loading…</p></div>
  if (error && !ctx) return <div style={wrap}><Header /><div style={card}><p>{error}</p></div></div>
  if (!ctx) return null

  if (done) {
    return (
      <div style={wrap}>
        <Header />
        <div style={{ ...card, borderColor: color.brand }}>
          <h3 style={{ color: color.brand, marginTop: 0 }}>✓ Thank you</h3>
          <p>Your update ({ACTION_LABELS[done] ?? done}) was recorded and the Agricarbon team has been notified.</p>
        </div>
      </div>
    )
  }

  const s = ctx.subject
  const isWO = ctx.type === 'WORK_ORDER'
  const isRes = ctx.type === 'RESERVATION'

  // ── Reservation checklist path ─────────────────────────────────────────────
  if (isRes) {
    const lines = s.lines ?? []
    const progress = s.progress ?? { checked: 0, total: lines.length }

    const checklistLines: ChecklistLine[] = lines.map((l) => ({
      id: l.id,
      name: l.name,
      requestedQty: l.requestedQty,
      itemType: l.itemType,
      fulfillmentStatus: l.fulfillmentStatus,
      fulfilledQty: l.fulfilledQty,
      substitutedItemId: l.substitutedItemId,
      substitutedName: l.substitutedName,
      resolvedUnitId: l.resolvedUnitId,
      denyReason: l.denyReason,
      availableUnits: l.availableUnits,
      substitutableItems: l.substitutableItems,
    }))

    const onLineAction = async (lineId: string, action: 'confirm' | 'edit' | 'deny', data: { fulfilledQty?: number; resolvedUnitId?: string; substitutedItemId?: string; denyReason?: string }) => {
      if (!actorLabel.trim()) return { ok: false, error: 'Please enter your name first.' }
      const intentKey = `${lineId}:${action}`
      let nonce = lineActionNonce.current.get(intentKey)
      if (!nonce) {
        nonce = crypto.randomUUID()
        lineActionNonce.current.set(intentKey, nonce)
      }
      try {
        const res = await fetch(`/api/s/${token}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `${token}:line:${lineId}:${action}:${nonce}` },
          body: JSON.stringify({ lineId, action, actorLabel, ...data }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { ok: false, error: json.error ?? 'Action failed.' }
        // Clear on success so the next distinct intent (e.g. re-editing this line to a new
        // qty) mints a fresh key and isn't deduped as a replay. NOTE: a cached 400 (schema
        // reject IS cacheable) leaves the nonce held, so a corrected retry of the SAME
        // (lineId, action) with a new body would 422 body-mismatch — out of scope here
        // (the checklist UI blocks invalid submits client-side before they reach the API).
        lineActionNonce.current.delete(intentKey)
        return { ok: true }
      } catch {
        return { ok: false, error: 'Network error — please try again.' }
      }
    }

    const onStage = async () => {
      if (!actorLabel.trim()) return { ok: false, error: 'Please enter your name first.' }
      try {
        const res = await fetch(`/api/s/${token}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `${token}:PREPARED` },
          body: JSON.stringify({ action: 'PREPARED', actorLabel }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { ok: false, error: json.error ?? 'Could not stage.' }
        setDone('PREPARED')
        return { ok: true }
      } catch {
        return { ok: false, error: 'Network error — please try again.' }
      }
    }

    return (
      <div style={wrap}>
        <Header />
        <div style={card}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: color.inkMuted }}>
            Rig Reservation Request
          </div>
          <h2 style={{ margin: '6px 0 12px' }}>{s.label ?? ctx.label ?? 'Rig Reservation'}</h2>
          {s.neededBy && <Row label="Needed by" value={formatDate(s.neededBy)} />}
          {s.requester && <Row label="Requester" value={s.requester} />}
          {s.project && <Row label="Project" value={s.project} />}
        </div>

        {!ctx.actionable ? (
          <div style={card}>
            <p style={{ margin: 0, color: color.inkMuted }}>
              {ctx.state === 'COMPLETED' ? 'This has been completed — thank you.'
                : ctx.state === 'EXPIRED' ? 'This link has expired. Please contact Agricarbon.'
                : ctx.state === 'REVOKED' ? 'This link is no longer valid. Please contact Agricarbon.'
                : 'No further action is available.'}
            </p>
          </div>
        ) : (
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>Checklist</h3>
            <label style={{ fontSize: 13, color: color.inkSoft }}>Your name</label>
            <input
              value={actorLabel}
              onChange={(e) => setActorLabel(e.target.value)}
              placeholder="e.g. Joe at Eastside Hub"
              style={inputStyle}
            />
            {lines.length > 0 ? (
              <FulfillmentChecklist
                lines={checklistLines}
                progress={progress}
                onLineAction={onLineAction}
                onStage={onStage}
                isActionable={ctx.actionable}
                stageLabel="Mark staged"
              />
            ) : (
              <p style={{ color: color.inkMuted, fontSize: 14 }}>No items on this reservation.</p>
            )}
            {error && <p style={{ color: color.errorAlt, fontSize: 14, marginTop: 8 }}>{error}</p>}
            <div style={{ marginTop: 16, borderTop: `1px solid `, paddingTop: 12 }}>
              <button
                disabled={submitting}
                style={btnDanger}
                onClick={() => { setChosen('DECLINED'); void submit('DECLINED') }}
              >
                {submitting && chosen === 'DECLINED' ? 'Submitting…' : 'Decline entire request'}
              </button>
            </div>
          </div>
        )}
        <p style={{ color: '#9aa0a6', fontSize: 12, marginTop: 16, textAlign: 'center' }}>Agricarbon Hardware Inventory &amp; Tracking</p>
      </div>
    )
  }

  // ── Non-reservation path (unchanged) ──────────────────────────────────────
  return (
    <div style={wrap}>
      <Header />
      <div style={card}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: color.inkMuted }}>
          {isWO ? 'Repair Work Order' : ctx.type === 'HUB_RETURN' ? 'Hub Return — Confirm Receipt' : 'Invoice'}
        </div>
        <h2 style={{ margin: '6px 0 12px' }}>{s.asset ?? ctx.label ?? 'Equipment'}{s.serialNumber ? ` · #${s.serialNumber}` : ''}</h2>
        {s.taskName && <Row label="Work" value={s.taskName} />}
        {s.problem && <Row label="Problem" value={s.problem} />}
        {s.shipToHub && <Row label="Return to" value={s.shipToHub} />}
        {s.hub && <Row label="Hub" value={s.hub} />}
      </div>

      {!ctx.actionable ? (
        <div style={card}>
          <p style={{ margin: 0, color: color.inkMuted }}>
            {ctx.state === 'COMPLETED' ? 'This has been completed — thank you.'
              : ctx.state === 'EXPIRED' ? 'This link has expired. Please contact Agricarbon.'
              : ctx.state === 'REVOKED' ? 'This link is no longer valid. Please contact Agricarbon.'
              : 'No further action is available.'}
          </p>
        </div>
      ) : (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Update status</h3>
          <label style={{ fontSize: 13, color: color.inkSoft }}>Your name</label>
          <input value={actorLabel} onChange={(e) => setActorLabel(e.target.value)} placeholder="e.g. Joe at Eastside Repair"
            style={inputStyle} />
          <label style={{ fontSize: 13, color: color.inkSoft }}>{chosen === 'INVOICED' ? 'Invoice number' : 'Note (optional)'}</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            style={{ width: '100%', padding: 12, fontSize: 15, borderRadius: 8, border: `1px solid `, margin: '6px 0 8px' }} />
          {error && <p style={{ color: color.errorAlt, fontSize: 14 }}>{error}</p>}
          {ctx.allowedActions.map((a) => (
            <button key={a} disabled={submitting}
              style={a === 'DISCREPANCY' || a === 'DECLINED' ? { ...btnOutline, borderColor: color.errorAlt, color: color.errorAlt } : btn}
              onClick={() => { setChosen(a); void submit(a) }}>
              {submitting && chosen === a ? 'Submitting…' : (ACTION_LABELS[a] ?? a)}
            </button>
          ))}
        </div>
      )}
      <p style={{ color: '#9aa0a6', fontSize: 12, marginTop: 16, textAlign: 'center' }}>Agricarbon Hardware Inventory &amp; Tracking</p>
    </div>
  )
}

function Header() {
  return (
    <div style={{ background: color.brand, color: color.surface, padding: '16px 20px', borderRadius: '12px 12px 0 0' }}>
      <h2 style={{ margin: 0 }}>🌱 Agricarbon</h2>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ flex: '0 0 90px', color: color.inkMuted, fontSize: 14 }}>{label}</div>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  )
}
