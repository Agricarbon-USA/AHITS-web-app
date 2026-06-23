'use client'

import { useEffect, useState, use } from 'react'

interface Subject {
  kind?: string
  taskName?: string
  asset?: string
  serialNumber?: string | null
  problem?: string | null
  shipToHub?: string | null
  photos?: string[]
  hub?: string | null
}
interface Context {
  type: 'WORK_ORDER' | 'HUB_RETURN' | 'INVOICE'
  state: string
  actionable: boolean
  allowedActions: string[]
  recipientName?: string | null
  subject: Subject
}

const ACTION_LABELS: Record<string, string> = {
  RECEIVED: 'Mark received',
  IN_PROGRESS: 'Mark in progress',
  COMPLETED: 'Mark completed',
  INVOICED: 'Submit invoice #',
  DISCREPANCY: 'Report a discrepancy',
  PAID: 'Mark paid',
}

const wrap: React.CSSProperties = { maxWidth: 560, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif', color: '#1a1a1a' }
const card: React.CSSProperties = { border: '1px solid #e0e0e0', borderRadius: 12, padding: 20, marginTop: 16, background: '#fff' }
const btn: React.CSSProperties = { background: '#2e7d32', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: 8, fontWeight: 600, fontSize: 15, cursor: 'pointer', minHeight: 48, width: '100%', marginTop: 8 }
const btnOutline: React.CSSProperties = { ...btn, background: '#fff', color: '#2e7d32', border: '1px solid #2e7d32' }

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

  useEffect(() => {
    fetch(`/api/s/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status === 404 ? 'This link was not found.' : 'Could not load this link.')))
      .then(setCtx)
      .catch((e) => setError(typeof e === 'string' ? e : 'Could not load this link.'))
      .finally(() => setLoading(false))
  }, [token])

  async function submit(action: string) {
    if (!actorLabel.trim()) { setError('Please enter your name first.'); return }
    setSubmitting(true); setError(null)
    try {
      const res = await fetch(`/api/s/${token}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `${token}:${action}:${Date.now()}` },
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
        <div style={{ ...card, borderColor: '#2e7d32' }}>
          <h3 style={{ color: '#2e7d32', marginTop: 0 }}>✓ Thank you</h3>
          <p>Your update ({ACTION_LABELS[done] ?? done}) was recorded and the Agricarbon team has been notified.</p>
        </div>
      </div>
    )
  }

  const s = ctx.subject
  const isWO = ctx.type === 'WORK_ORDER'

  return (
    <div style={wrap}>
      <Header />
      <div style={card}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: '#757575' }}>
          {isWO ? 'Repair Work Order' : ctx.type === 'HUB_RETURN' ? 'Hub Return — Confirm Receipt' : 'Invoice'}
        </div>
        <h2 style={{ margin: '6px 0 12px' }}>{s.asset ?? 'Equipment'}{s.serialNumber ? ` · #${s.serialNumber}` : ''}</h2>
        {s.taskName && <Row label="Work" value={s.taskName} />}
        {s.problem && <Row label="Problem" value={s.problem} />}
        {s.shipToHub && <Row label="Return to" value={s.shipToHub} />}
        {s.hub && <Row label="Hub" value={s.hub} />}
        {!!s.photos?.length && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {s.photos.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={u} alt={`photo ${i + 1}`} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid #e0e0e0' }} />
            ))}
          </div>
        )}
      </div>

      {!ctx.actionable ? (
        <div style={card}>
          <p style={{ margin: 0, color: '#757575' }}>
            {ctx.state === 'COMPLETED' ? 'This has been completed — thank you.'
              : ctx.state === 'EXPIRED' ? 'This link has expired. Please contact Agricarbon.'
              : ctx.state === 'REVOKED' ? 'This link is no longer valid. Please contact Agricarbon.'
              : 'No further action is available.'}
          </p>
        </div>
      ) : (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Update status</h3>
          <label style={{ fontSize: 13, color: '#555' }}>Your name</label>
          <input value={actorLabel} onChange={(e) => setActorLabel(e.target.value)} placeholder="e.g. Joe at Eastside Repair"
            style={{ width: '100%', padding: 12, fontSize: 15, borderRadius: 8, border: '1px solid #ccc', margin: '6px 0 12px', minHeight: 44 }} />
          <label style={{ fontSize: 13, color: '#555' }}>{chosen === 'INVOICED' ? 'Invoice number' : 'Note (optional)'}</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            style={{ width: '100%', padding: 12, fontSize: 15, borderRadius: 8, border: '1px solid #ccc', margin: '6px 0 8px' }} />
          {error && <p style={{ color: '#d32f2f', fontSize: 14 }}>{error}</p>}
          {ctx.allowedActions.map((a) => (
            <button key={a} disabled={submitting}
              style={a === 'DISCREPANCY' ? btnOutline : btn}
              onClick={() => { setChosen(a); submit(a) }}>
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
    <div style={{ background: '#2e7d32', color: '#fff', padding: '16px 20px', borderRadius: '12px 12px 0 0' }}>
      <h2 style={{ margin: 0 }}>🌱 Agricarbon</h2>
    </div>
  )
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ flex: '0 0 90px', color: '#757575', fontSize: 14 }}>{label}</div>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  )
}
