// UXP-3 (3h): the daily-check DRAFT — a half-done check survives a reload, an OS kill
// of the installed PWA, and the 401 → /login → back bounce (G-3, softened: the draft
// is restored on the next visit rather than the operator being returned mid-form).
//
// Pure module: no React, no network. Every storage call is wrapped — private mode,
// a full quota, a disabled Storage API, or a corrupt value must never throw into
// the page; a draft is best-effort insurance, never load-bearing for the submit.
//
// Store: localStorage (NOT sessionStorage). sessionStorage is per-tab and is not
// reliably kept when an iOS standalone PWA is killed from the switcher — the packet's
// own smoke row ("kill the app → reopen → draft restored") is exactly the case it
// loses. localStorage survives the kill; the cost is that it is device-wide, so the
// key carries the signed-in operator's id (from the same `ahits_identity` cache the
// offline queue tags telemetry with) — operator A's draft never restores for B on a
// shared phone. `getStore()` is the ONE accessor, so a swap is one line.

export const DRAFT_PREFIX = 'ahits_dc_draft:'
const DRAFT_VERSION = 1
const IDENTITY_KEY = 'ahits_identity'

export type DraftRowValue = 'yes' | 'no' | 'na'

export interface DailyCheckDraftRow {
  key: string
  label: string
  value: DraftRowValue
  note: string
}

export interface DailyCheckDraft {
  v: typeof DRAFT_VERSION
  vehicleId: string
  /** Business date (YYYY-MM-DD) the draft belongs to — drafts never cross a day. */
  date: string
  step: number
  odometer: string
  site: string
  siteTouched: boolean
  issues: string
  issuesPrefilled: boolean
  rowsTouched: boolean
  checklist: DailyCheckDraftRow[]
  /** Active form time so far — the restore rebases the time-to-complete clock on it. */
  elapsedMs: number
  savedAt: number
}

export type DailyCheckDraftInput = Omit<DailyCheckDraft, 'v' | 'savedAt'>

function getStore(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage ?? null
  } catch {
    return null // Storage access itself can throw (disabled / sandboxed)
  }
}

/**
 * The signed-in user's id from the identity cache `useAuth` maintains (`ahits_identity`
 * holds the `/api/auth/me` SessionUser, whose id field is `userId`). 'anon' when there
 * is no cache — the draft still works, it is just not operator-scoped.
 */
export function draftUserId(): string {
  const store = getStore()
  if (!store) return 'anon'
  try {
    const raw = store.getItem(IDENTITY_KEY)
    if (!raw) return 'anon'
    const parsed = JSON.parse(raw) as { userId?: unknown; id?: unknown } | null
    const id = parsed?.userId ?? parsed?.id
    return typeof id === 'string' && id ? id : 'anon'
  } catch {
    return 'anon'
  }
}

export function draftKey(vehicleId: string, date: string, userId: string = draftUserId()): string {
  return `${DRAFT_PREFIX}${userId}:${vehicleId}:${date}`
}

const ROW_VALUES: ReadonlySet<string> = new Set(['yes', 'no', 'na'])

// Minimal shape check — a draft from a future version, a hand-edited value, or a
// truncated write is treated as "no draft" rather than restored into the form.
function parseDraft(raw: string | null): DailyCheckDraft | null {
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as Partial<DailyCheckDraft> | null
    if (!d || d.v !== DRAFT_VERSION) return null
    if (typeof d.vehicleId !== 'string' || !d.vehicleId) return null
    if (typeof d.date !== 'string' || !d.date) return null
    if (!Array.isArray(d.checklist) || d.checklist.length === 0) return null
    const checklist: DailyCheckDraftRow[] = []
    for (const row of d.checklist) {
      if (!row || typeof row.key !== 'string' || typeof row.label !== 'string') return null
      if (typeof row.value !== 'string' || !ROW_VALUES.has(row.value)) return null
      checklist.push({ key: row.key, label: row.label, value: row.value, note: typeof row.note === 'string' ? row.note : '' })
    }
    const step = typeof d.step === 'number' && Number.isFinite(d.step) ? Math.min(2, Math.max(0, Math.trunc(d.step))) : 0
    return {
      v: DRAFT_VERSION,
      vehicleId: d.vehicleId,
      date: d.date,
      step,
      odometer: typeof d.odometer === 'string' ? d.odometer : '',
      site: typeof d.site === 'string' ? d.site : '',
      siteTouched: d.siteTouched === true,
      issues: typeof d.issues === 'string' ? d.issues : '',
      issuesPrefilled: d.issuesPrefilled === true,
      rowsTouched: d.rowsTouched === true,
      checklist,
      elapsedMs: typeof d.elapsedMs === 'number' && Number.isFinite(d.elapsedMs) && d.elapsedMs > 0 ? d.elapsedMs : 0,
      savedAt: typeof d.savedAt === 'number' && Number.isFinite(d.savedAt) ? d.savedAt : 0,
    }
  } catch {
    return null
  }
}

export function saveDraft(input: DailyCheckDraftInput): void {
  const store = getStore()
  if (!store) return
  try {
    const draft: DailyCheckDraft = { ...input, v: DRAFT_VERSION, savedAt: Date.now() }
    store.setItem(draftKey(input.vehicleId, input.date), JSON.stringify(draft))
  } catch {
    /* quota / private mode — the draft is best-effort */
  }
}

export function loadDraft(vehicleId: string, date: string): DailyCheckDraft | null {
  const store = getStore()
  if (!store) return null
  try {
    return parseDraft(store.getItem(draftKey(vehicleId, date)))
  } catch {
    return null
  }
}

/** All of ONE user's draft keys (any vehicle, any date) — the signed-in user by default. */
function ownKeys(store: Storage, userId: string = draftUserId()): string[] {
  const prefix = `${DRAFT_PREFIX}${userId}:`
  const keys: string[] = []
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k && k.startsWith(prefix)) keys.push(k)
  }
  return keys
}

/** The most recently saved draft of this user's dated `date` — the no-`?vehicleId=` restore. */
export function loadLatestDraft(date: string): DailyCheckDraft | null {
  const store = getStore()
  if (!store) return null
  try {
    let best: DailyCheckDraft | null = null
    for (const k of ownKeys(store)) {
      const d = parseDraft(store.getItem(k))
      if (!d || d.date !== date) continue
      if (!best || d.savedAt > best.savedAt) best = d
    }
    return best
  } catch {
    return null
  }
}

export function clearDraft(vehicleId: string, date: string): void {
  const store = getStore()
  if (!store) return
  try {
    store.removeItem(draftKey(vehicleId, date))
  } catch {
    /* nothing to do */
  }
}

/**
 * Drop every draft (any user on this device) not dated `date`. A daily check is a
 * per-day record, so yesterday's half-done check is stale by definition — restoring
 * it today would file yesterday's answers under today's date.
 */
export function purgeDraftsNotOn(date: string): void {
  const store = getStore()
  if (!store) return
  try {
    const stale: string[] = []
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i)
      if (!k || !k.startsWith(DRAFT_PREFIX)) continue
      const d = parseDraft(store.getItem(k))
      if (!d || d.date !== date) stale.push(k) // unparseable drafts are stale too
    }
    for (const k of stale) store.removeItem(k)
  } catch {
    /* nothing to do */
  }
}

/**
 * Drop every draft of ONE user — any vehicle, any date. The sign-out hook (privacy):
 * the key scoping keeps operator A's half-done check invisible to operator B on a
 * shared phone; this removes it outright when A signs out. The caller passes the id
 * it read from the identity cache BEFORE clearing that cache (the keys carry it).
 * An empty id is a no-op — it must never widen into a wildcard.
 */
export function purgeDraftsForUser(userId: string): void {
  if (!userId) return
  const store = getStore()
  if (!store) return
  try {
    for (const k of ownKeys(store, userId)) store.removeItem(k)
  } catch {
    /* nothing to do */
  }
}
