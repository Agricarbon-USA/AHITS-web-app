'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Stack, Alert, Chip, CircularProgress,
  Stepper, Step, StepLabel, TextField, List, ListItem, ListItemText,
  ToggleButtonGroup, ToggleButton, MenuItem, Paper, Divider,
} from '@mui/material'
import { useToast } from '@/components/shared/useToast'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { useHistoryGuard } from '@/hooks/useHistoryGuard'
import { businessDate } from '@/lib/business-date'
import { DEFAULT_DAILY_CHECKLIST } from '@/types'
import { OdometerField } from '@/components/operator/OdometerField'
import { saveDraft, loadDraft, loadLatestDraft, clearDraft, purgeDraftsNotOn, type DailyCheckDraft } from '@/lib/daily-check-draft'

// The full ~16-item inspection (PRD §11.4) is the single source of truth, shared
// with the rest of the app via @/types. Items 15–16 (trailer hitch / load) are
// conditional — operators mark them N/A when not towing / hauling.
const DEFAULT_CHECKLIST = DEFAULT_DAILY_CHECKLIST

interface ChecklistRow {
  key: string
  label: string
  value: 'yes' | 'no' | 'na'
  note: string
}

// CC-15 (D2): the check's attestation GPS. Optional — every field is omitted when
// location is unavailable, so the payload simply carries no coords.
type CheckCoords = { gpsLat?: number; gpsLng?: number; gpsAccuracy?: number }

// CC-15 (D2): capture ONE position for this daily check. Resolve-or-skip — this NEVER
// rejects and NEVER blocks the submit: denied permission, a dismissed prompt, an error,
// or the timeout all resolve to {} (no coords) so the check submits either way. Called
// on-device at submit time, so the coords ride the queued payload when offline (GPS
// needs no network). This is a single fix per attestation — no watchPosition, no
// polling, no background location (the D2 anti-goal guard).
function captureLocation(): Promise<CheckCoords> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({})
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        gpsLat: pos.coords.latitude,
        gpsLng: pos.coords.longitude,
        gpsAccuracy: pos.coords.accuracy,
      }),
      () => resolve({}), // denied / dismissed / position-unavailable / timeout → no coords
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  })
}

// UXP-3 (3a): GPS can never hold a check hostage. getCurrentPosition's `timeout`
// bounds the FIX, not the permission UI — while the OS prompt sits unanswered (or a
// PWA's prompt never renders at all) the callback simply never fires, and until CC-32
// the submit awaited it indefinitely: nothing enqueued, "Submitting…" forever. This is
// a hard ceiling measured from the Submit tap: past it the check goes out with no
// coords, exactly as a denial does. A fix that lands after the ceiling is dropped for
// this check (D2: location is optional). setTimeout + clearTimeout (not a bare
// Promise.race leak) so the timer is deterministic under fake timers and never
// outlives a settled promise.
const GPS_CEILING_MS = 8_000

function withCeiling<T>(p: Promise<T>, fallback: T, ms: number = GPS_CEILING_MS): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(fallback)
    }, ms)
    const settle = (value: T) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    p.then(settle, () => settle(fallback))
  })
}

interface RigVehicle {
  id: string
  vehicle: { id: string; name: string; type?: string }
}

interface ActiveRig {
  id: string
  vehicles: RigVehicle[]
}

// UXP-3 (3j): the wrong-vehicle autopilot guard. The preselect used to be "first in
// the rig", so check #2 of the day landed on the vehicle that was just checked and a
// hurried operator filed the same truck twice while the second one went unchecked.
// Now: the first rig-order vehicle WITHOUT a check today; none left → no preselect
// (the operator picks deliberately, and the already-checked notice tells them why).
function pickPreselect(vehicles: RigVehicle[], checked: ReadonlySet<string>): string {
  return vehicles.find((rv) => !checked.has(rv.vehicle.id))?.vehicle.id ?? ''
}

// Reads `{ data: [{ vehicleId }] }` from the daily-check list GET into the set of
// vehicles this operator has already filed today. Any failure → empty set, which is
// exactly today's first-in-list behaviour (the guard degrades to the old default).
async function fetchCheckedToday(date: string): Promise<Set<string>> {
  const res = await fetch(`/api/daily-check?date=${encodeURIComponent(date)}&pageSize=100`)
  if (!res.ok) return new Set()
  const json = (await res.json()) as { data?: Array<{ vehicleId?: unknown }> } | null
  const ids = (Array.isArray(json?.data) ? json.data : [])
    .map((c) => c?.vehicleId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  return new Set(ids)
}

// UXP-3 (F-05): the fields a validation reject can jump to. Keyed so one ref map and
// one focus request serve both the per-item notes and the fail summary.
const issuesFieldKey = 'issues'
const noteFieldKey = (rowKey: string) => `note:${rowKey}`

export default function OperatorDailyCheckPage() {
  const showToast = useToast()
  const { mutate, pending, isOffline } = useOfflineQueue()

  const [rig, setRig] = React.useState<ActiveRig | null>(null)
  const [vehicleId, setVehicleId] = React.useState('')
  // P2-C: a vehicle scanned via QR may not be on the operator's active rig
  // (UR-033 allows daily-checking any vehicle). Hold its details so it shows in
  // the picker + name + checklist-type resolution instead of rendering as "—".
  const [scannedVehicle, setScannedVehicle] = React.useState<{ id: string; name: string; type: string } | null>(null)
  const [date, setDate] = React.useState(() => businessDate())
  const [odometer, setOdometer] = React.useState('')
  const [site, setSite] = React.useState('')
  const [checklist, setChecklist] = React.useState<ChecklistRow[]>(
    DEFAULT_CHECKLIST.map((item) => ({ ...item, value: 'yes', note: '' }))
  )
  const [issues, setIssues] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [submitted, setSubmitted] = React.useState(false)
  const [error, setError] = React.useState('')
  const [step, setStep] = React.useState(0)
  // UXP-1e: hardware/browser Back steps the wizard back (answers intact) instead of
  // leaving the page. Armed only while past step 0 and not yet submitted — the success
  // screen has no step nav, so Back should leave normally there.
  useHistoryGuard(step > 0 && !submitted, () => setStep((s) => Math.max(0, s - 1)))
  // CC-14 (NS-5): the selected vehicle's last-known odometer, for the inline sanity
  // warning. Fetched per vehicle; null while unknown / offline (warning stays silent).
  const [lastOdometer, setLastOdometer] = React.useState<number | null>(null)
  // CC-32 (2.2): the vehicle's most recent non-empty daily-check site, from the same
  // GET that already supplies lastOdometer. Held so "Start New Check" can re-seed the
  // field too. null when unknown / offline / never checked → the field stays empty.
  const [lastCheckSite, setLastCheckSite] = React.useState<string | null>(null)
  // CC-32 (2.2): the operator typed in the site field, so a late-arriving
  // lastCheckSite must never clobber it. Cleared on "Start New Check".
  const siteTouchedRef = React.useRef(false)
  // CC-32 (2.1): the issue summary has been auto-filled once from the per-item notes.
  // One-shot, so typing → clearing → Back → Next does NOT silently re-fill it.
  const issuesPrefilledRef = React.useRef(false)
  // CC-32 (2.5b): a checklist template arrived AFTER the operator started answering.
  // Their answers are kept; this is the dismissible one-line heads-up. No merge UI.
  const [staleTemplate, setStaleTemplate] = React.useState(false)
  // CC-32 (2.5a): bumped by handleReset so the template effect re-fires even when the
  // reset re-selects the SAME vehicle — otherwise check #2 of the day silently ran the
  // built-in 16 items instead of the admin template.
  const [templateNonce, setTemplateNonce] = React.useState(0)
  // CC-32 (2.6): the warmed GPS fix. captureLocation() is started when the REVIEW step
  // mounts so the OS permission prompt fires while the operator reads the summary,
  // not behind "Submitting…". Tagged with the vehicle it was captured for.
  const warmCoordsRef = React.useRef<{ vehicleId: string; promise: Promise<CheckCoords> } | null>(null)
  // CC-32 (2.5b): the PRISTINE predicate, kept as its two independent halves so the
  // reset path can relax exactly one of them (below). Refs, not state: they are read
  // inside a fetch callback and must never be a stale render closure.
  //   rowsTouchedRef — the operator edited ANY row (a value moved off 'yes', or a note
  //                    was typed). This half ALWAYS vetoes a template replacement:
  //                    real answers are never discarded.
  //   pastStep0Ref   — the operator moved past step 0. Work-in-progress by proxy even
  //                    when every row still reads 'yes'.
  // PRISTINE = !rowsTouched && !pastStep0.
  const rowsTouchedRef = React.useRef(false)
  const pastStep0Ref = React.useRef(false)
  // CC-32 (2.5a): the ONE resolve that "Start New Check" asked for. A reset has just
  // cleared every answer, so that resolve may apply even if the operator has already
  // tapped forward through the (still empty) form — otherwise a fast Next between the
  // reset and the template landing silently reinstates the very bug 2.5a fixes. It can
  // never override a TOUCHED row: rowsTouchedRef still vetoes. Consumed on first use.
  const templateForceRef = React.useRef(false)
  // CC-14: passive time-to-complete — form open → submit. Stamped in the mount effect
  // (Date.now() in render trips the impure-in-render rule); reset on "Start New Check".
  const startedAtRef = React.useRef<number>(0)
  // UXP-3 (3j): vehicles this operator has already filed a check for today. Seeded
  // from the daily-check list GET at mount (failure → empty), and grown locally after
  // an ok/queued submit so "Start New Check" advances to the next unchecked vehicle
  // without a refetch (a queued check is not on the server yet, but it IS filed).
  const [checkedToday, setCheckedToday] = React.useState<ReadonlySet<string>>(() => new Set())
  // UXP-3 (3h): a draft was restored at mount. The ref gates the 3j preselect (the
  // restored vehicle wins over the "first unchecked" pick); the state drives the
  // dismissible "Restored your in-progress check" notice.
  const restoredRef = React.useRef(false)
  const [restoredNotice, setRestoredNotice] = React.useState(false)
  // UXP-3 (3h): the checklist keys the draft was restored with. A restored draft is
  // never pristine (pastStep0 / rowsTouched), so the template resolve that follows
  // would otherwise trip the CC-32 (2.5b) guard and raise a FALSE "A newer checklist…"
  // notice for the very template the draft was filled on. Consumed on first compare;
  // a template that genuinely changed since the draft still gets the notice.
  const restoredKeysRef = React.useRef<string[] | null>(null)
  // UXP-3 (3h, antagonist): the vehicles whose draft THIS session wrote. The save
  // effect's pristine branch clears a draft only for these — an untouched form landing
  // on a vehicle (picker switch, "Start New Check") says nothing about a draft an
  // EARLIER session left there, and used to delete it silently. That draft is restored
  // instead (restoreStoredDraft, below).
  const savedVehiclesRef = React.useRef<Set<string>>(new Set())
  // UXP-3 (F-05): validation reject → field-level errors + a jump to the field. The
  // top Alert alone sat ~1300px above the failing row on a long inspection list.
  //   showNoteErrors — reveal "Required — describe the issue" under every empty note
  //                    of a row marked "No" (typing clears it); reset on a clean Next.
  //   issuesError    — the fail-summary field's error state (typing clears it).
  //   focusRequest   — {target, n}: the field to scroll into view + focus. The nonce
  //                    re-fires the effect when the SAME field rejects twice.
  //   fieldRefs      — filled via ref callbacks (react-hooks `refs` forbids writes in
  //                    render); keyed by noteFieldKey(row) / issuesFieldKey.
  const [showNoteErrors, setShowNoteErrors] = React.useState(false)
  const [issuesError, setIssuesError] = React.useState(false)
  const [focusRequest, setFocusRequest] = React.useState<{ target: string; n: number } | null>(null)
  const fieldRefs = React.useRef<Map<string, HTMLElement>>(new Map())
  const registerField = React.useCallback((target: string) => (el: HTMLElement | null) => {
    if (el) fieldRefs.current.set(target, el)
    else fieldRefs.current.delete(target)
  }, [])

  // The selectable vehicles: the active-rig vehicles, plus a scanned vehicle that
  // isn't on the rig (so QR-scanning any vehicle opens a usable daily check).
  const vehicles = React.useMemo<RigVehicle[]>(() => {
    const base = rig?.vehicles ?? []
    if (scannedVehicle && !base.some((rv) => rv.vehicle.id === scannedVehicle.id)) {
      return [{ id: scannedVehicle.id, vehicle: { id: scannedVehicle.id, name: scannedVehicle.name, type: scannedVehicle.type } }, ...base]
    }
    return base
  }, [rig, scannedVehicle])

  // UXP-3 (3h): put a stored draft back into the form — vehicle, answers, odometer,
  // site, the step they were on — plus the refs the CC-32 guards read. Shared by the
  // mount restore and the pristine-landing restores (picker switch / "Start New Check"
  // onto a vehicle an earlier session left a draft on). Stable (refs + setters only),
  // so the mount effect can list it and still run once.
  const applyDraft = React.useCallback((draft: DailyCheckDraft) => {
    restoredKeysRef.current = draft.checklist.map((r) => r.key)
    siteTouchedRef.current = draft.siteTouched
    issuesPrefilledRef.current = draft.issuesPrefilled
    rowsTouchedRef.current = draft.rowsTouched
    pastStep0Ref.current = draft.step > 0
    // The restored check runs on the template it was filled on (restoredKeysRef); a
    // reset's pending force must not let a genuinely newer template replace its rows
    // silently — that case gets the same 2.5b notice the mount restore gets.
    templateForceRef.current = false
    // CC-31 item 5 / CC-14: time-to-complete counts the operator's active form time
    // only — rebase the clock so the interruption (kill, reload, re-login, a detour
    // to another truck) is excluded.
    startedAtRef.current = Date.now() - draft.elapsedMs
    setVehicleId(draft.vehicleId)
    setChecklist(draft.checklist)
    setOdometer(draft.odometer)
    setSite(draft.site)
    setIssues(draft.issues)
    setStep(draft.step)
    setRestoredNotice(true)
  }, [])

  React.useEffect(() => {
    const today = businessDate()
    // A scan of a vehicle label routes here as ?vehicleId=<id> (PRD §7.7) —
    // preselect it when present.
    const preselect =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('vehicleId')
        : null
    // UXP-3 (3h): restore a same-day draft BEFORE any fetch — the restore must not
    // wait on the network. Yesterday's drafts are stale by definition (a check is a
    // per-day record) and are purged first. A scan/redo deep-link restores only that
    // vehicle's draft; otherwise the most recently saved draft of today wins.
    purgeDraftsNotOn(today)
    const draft = preselect ? loadDraft(preselect, today) : loadLatestDraft(today)
    if (draft) {
      restoredRef.current = true
      applyDraft(draft)
    } else {
      startedAtRef.current = Date.now() // start the time-to-complete clock at mount
      if (preselect) setVehicleId(preselect)
    }
    // Fetch the scanned (or draft-restored) vehicle's details so it renders even if
    // it's not on the operator's active rig (any-vehicle daily check, UR-033).
    const detailId = preselect ?? draft?.vehicleId ?? null
    if (detailId) {
      fetch(`/api/vehicles/${detailId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const v = d?.data
          if (v?.id) setScannedVehicle({ id: v.id, name: v.name, type: v.type })
        })
        .catch(() => { /* offline / not found — fall back to rig vehicles */ })
    }
    // UXP-3 (3j): the rig renders as soon as it lands (as before); the PRESELECT is
    // decided once, when both the rig and today's checks have settled. Either failing
    // keeps its old default (no rig / empty set).
    const rigPromise = fetch('/api/deployments')
      .then((r) => r.json())
      .then((json): ActiveRig | null => {
        const active: ActiveRig | null = json?.[0] ?? null
        setRig(active)
        return active
      })
    Promise.allSettled([rigPromise, fetchCheckedToday(today)]).then(([rigResult, checkedResult]) => {
      const checked = checkedResult.status === 'fulfilled' ? checkedResult.value : new Set<string>()
      setCheckedToday(checked)
      const active = rigResult.status === 'fulfilled' ? rigResult.value : null
      // UXP-3 (3j, antagonist): the picker is live the moment the rig lands, and the
      // checks GET can land seconds later — by then the operator may have picked a
      // truck deliberately and answered rows for it. A preselect only ever fills an
      // EMPTY selection; it never overrides a pick, and the all-checked case
      // (pickPreselect → '') never blanks one. Functional update: the pick lives in
      // state this callback never saw.
      if (!preselect && !restoredRef.current && active?.vehicles?.length) {
        setVehicleId((prev) => prev || pickPreselect(active.vehicles, checked))
      }
    })
    // applyDraft is a stable useCallback — this is still the one-time mount effect.
  }, [applyDraft])

  // Q3: the selected vehicle's TYPE as a stable string. The checklist effect below
  // keys off THIS, not the `vehicles` array ref — so it re-fetches the template only
  // when the vehicle/type actually changes, not every time /api/deployments resolves
  // and setRig produces a new `vehicles` reference. Depending on the array ref
  // previously re-ran the effect and silently wiped the operator's entered picks/notes.
  const selectedVehicleType = vehicles.find((rv) => rv.vehicle.id === vehicleId)?.vehicle.type ?? ''

  // M5-25: resolve the admin-configured checklist for the selected vehicle's
  // type, falling back to the built-in ~16-item default. Re-runs when the
  // operator switches vehicles. Offline / no template → keep the default list.
  // CC-32 (2.5) — second-check template correctness. Two defects, both fixed here.
  // CC-32 (2.5a): `templateNonce` is in the key so handleReset re-resolves the template
  // even when it re-selects the SAME vehicle. Without it, [vehicleId, selectedVehicleType]
  // were both unchanged after a reset, the effect never re-fired, and check #2 of the day
  // silently ran the built-in 16 items instead of the admin template.
  React.useEffect(() => {
    // Wait until the vehicle's type is actually known before fetching, so we don't
    // fire once with a blank type and then re-fetch (and reset the checklist) when it
    // resolves — closes the narrow preselect/scan-path wipe. Unknown type keeps the default.
    if (!vehicleId || !selectedVehicleType) return
    let active = true
    fetch(`/api/checklist-templates?vehicleType=${encodeURIComponent(selectedVehicleType)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return
        const items: { key: string; label: string }[] =
          Array.isArray(d?.items) && d.items.length ? d.items : DEFAULT_CHECKLIST
        // UXP-3 (3h): a restored draft already runs on this template — same keys, same
        // order — so there is nothing to apply and nothing "newer" to announce. One-shot:
        // a later resolve (vehicle switch, reset nonce) is judged by the 2.5b rules below.
        const restoredKeys = restoredKeysRef.current
        restoredKeysRef.current = null
        if (restoredKeys && restoredKeys.length === items.length && restoredKeys.every((k, i) => k === items[i].key)) return
        // CC-32 (2.5b): a LATE template response must never wipe work in progress (the
        // FND-35 family — the scan path's ?vehicleId= race is the reproducible case).
        // Pristine → apply silently, exactly as before. Touched → keep every answer and
        // raise a dismissible one-line notice; the operator finishes on what they started.
        const forced = templateForceRef.current
        templateForceRef.current = false
        const mayApply = !rowsTouchedRef.current && (!pastStep0Ref.current || forced)
        if (!mayApply) { setStaleTemplate(true); return }
        setChecklist(items.map((it) => ({ key: it.key, label: it.label, value: 'yes', note: '' })))
        setStaleTemplate(false)
      })
      .catch(() => { /* offline — keep the current (default) list */ })
    return () => { active = false }
  }, [vehicleId, selectedVehicleType, templateNonce])

  // CC-14 (NS-5): fetch the selected vehicle's last-known odometer for the sanity
  // warning. Keyed on vehicleId so it re-reads when the operator switches vehicles;
  // offline / not-found leaves it null (the warning simply stays quiet).
  React.useEffect(() => {
    if (!vehicleId) { setLastOdometer(null); setLastCheckSite(null); return }
    let active = true
    fetch(`/api/vehicles/${vehicleId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return
        setLastOdometer(typeof d?.data?.odometer === 'number' ? d.data.odometer : null)
        // CC-32 (2.2): the site is retyped every morning today. The cheapest correct
        // source is this same GET — `lastCheckSite` is an additive read-side field (the
        // vehicle's most recent non-empty daily_checks.site; no schema change). Seed the
        // field only while it is still empty AND untouched, via a functional update so
        // a fix that lands mid-typing can't read a stale closure. Absent → stays empty.
        const site = typeof d?.data?.lastCheckSite === 'string' ? d.data.lastCheckSite : null
        setLastCheckSite(site)
        if (site) setSite((prev) => (prev === '' && !siteTouchedRef.current ? site : prev))
      })
      .catch(() => { if (active) { setLastOdometer(null); setLastCheckSite(null) } })
    return () => { active = false }
  }, [vehicleId])

  // CC-32 (2.6): warm the GPS fix when the REVIEW step mounts. captureLocation() takes
  // up to 10s (high-accuracy) and used to run only after the Submit tap, stacking those
  // seconds behind "Submitting…" on a check that otherwise takes ~11s. Starting it here
  // fires the OS permission prompt while the operator reads the review summary; the
  // promise is held and awaited at submit. Semantics are UNCHANGED: still exactly one
  // fix per check, still resolve-or-skip, still never blocks or fails a submit (D2 —
  // no watchPosition, no polling). Re-warmed if the vehicle changed since.
  React.useEffect(() => {
    if (step !== 2 || !vehicleId) return
    if (warmCoordsRef.current?.vehicleId === vehicleId) return
    warmCoordsRef.current = { vehicleId, promise: captureLocation() }
  }, [step, vehicleId])

  // UXP-3 (3h): persist the draft on every form change. A PRISTINE form (step 0,
  // no row touched, no odometer, site untouched, no summary) clears its draft instead
  // — but only a draft THIS session wrote (savedVehiclesRef): the operator emptied
  // the form they were filling. A vehicle-switch or reset also lands the form
  // pristine on the new vehicle, and an earlier session's draft there is not ours to
  // drop — it is restored by restoreStoredDraft, never cleared here (antagonist 3h).
  // Skipped once submitted: the submit path clears the draft itself and the success
  // screen must not re-save it. Refs are read here, not in render.
  React.useEffect(() => {
    if (!vehicleId || submitted) return
    const today = businessDate()
    const pristine = step === 0 && !rowsTouchedRef.current && odometer === '' && !siteTouchedRef.current && issues === ''
    if (pristine) {
      if (savedVehiclesRef.current.has(vehicleId)) clearDraft(vehicleId, today)
      return
    }
    savedVehiclesRef.current.add(vehicleId)
    saveDraft({
      vehicleId,
      date: today,
      step,
      odometer,
      site,
      siteTouched: siteTouchedRef.current,
      issues,
      issuesPrefilled: issuesPrefilledRef.current,
      rowsTouched: rowsTouchedRef.current,
      checklist,
      elapsedMs: startedAtRef.current ? Math.max(0, Date.now() - startedAtRef.current) : 0,
    })
  }, [vehicleId, odometer, site, checklist, issues, step, submitted])

  // UXP-3 (F-05): bring the first failing field into view and focus it. Runs after
  // the render that also switched steps, so the field's ref callback has already
  // registered it. Both calls are optional-chained: jsdom has no scrollIntoView, and
  // a field that unmounted between the request and the commit is simply skipped.
  React.useEffect(() => {
    if (!focusRequest) return
    const el = fieldRefs.current.get(focusRequest.target)
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    el?.focus?.()
  }, [focusRequest])

  const passFail = checklist.every((item) => item.value !== 'no')
  const failingItems = checklist.filter((item) => item.value === 'no')
  // PRD §11.4 / §7.4: a reason is required on every failed item, not just an
  // overall summary. Enforced client-side here and again server-side.
  const missingItemNote = failingItems.some((item) => !item.note.trim())
  const selectedVehicleName =
    vehicles.find((rv) => rv.vehicle.id === vehicleId)?.vehicle.name ?? ''

  const buildPayload = (coords: CheckCoords = {}, durationMs?: number) => ({
    vehicleId,
    // CC-29 item 4a: stamp the ORIGINAL business date at submit-click, NOT the `date`
    // state — so a form left open overnight is filed under the day the operator
    // actually hit Submit, and a late offline replay carries THAT date (the server
    // trusts it within a bounded past window; see the daily-check route). businessDate()
    // is called here (an event handler), never in render.
    date: businessDate(),
    odometer: odometer ? parseInt(odometer) : undefined,
    site: site || undefined,
    checklistJson: checklist.map(({ key, label, value, note }) => ({ key, label, value, note: note || undefined })),
    issues: issues || undefined,
    passFail,
    // CC-14: passive time-to-complete, measured at submit-click (correct even if the
    // check later syncs from the offline queue). CC-31 item 5: stamped by the caller
    // BEFORE the up-to-10s GPS wait and passed in, so the GPS wait no longer inflates it
    // (charter metric 2 honesty). undefined until the mount clock starts.
    durationMs,
    // CC-15 (D2): attestation GPS captured just before enqueue; the keys are absent when
    // location was unavailable, so the payload — online or queued offline — carries no
    // coords rather than nulls.
    ...coords,
  })

  // UXP-3 (F-05): a validation reject lands the operator ON the failing field, not on
  // a top Alert a screen above it. Mirrors the server's superRefine exactly (a note per
  // "No" row, then a summary for a failing check) so a 400 replays the same reveal.
  // Returns whether anything was revealed — false means the client rules see no
  // fault (a 400 for some other reason keeps the server's message alone).
  const revealFirstInvalid = (): boolean => {
    const firstMissing = checklist.find((row) => row.value === 'no' && !row.note.trim())
    if (firstMissing) {
      setShowNoteErrors(true)
      setStep(1)
      setFocusRequest((prev) => ({ target: noteFieldKey(firstMissing.key), n: (prev?.n ?? 0) + 1 }))
      return true
    }
    if (!passFail && !issues.trim()) {
      setIssuesError(true)
      setStep(2)
      setFocusRequest((prev) => ({ target: issuesFieldKey, n: (prev?.n ?? 0) + 1 }))
      return true
    }
    return false
  }

  const handleSubmit = async () => {
    if (!vehicleId) { setError('Select a vehicle'); return }
    if (missingItemNote) { setError('Add a note for each item marked “No”.'); revealFirstInvalid(); return }
    if (!passFail && !issues.trim()) { setError('Describe the issue(s) that caused a fail'); revealFirstInvalid(); return }
    setSubmitting(true)
    setError('')
    // CC-31 item 5: stamp the time-to-complete NOW, before the up-to-10s GPS wait below,
    // so captureLocation()'s latency doesn't inflate the measured check duration (charter
    // metric 2, whose "trending down" reading was confounded by the GPS wait riding it).
    const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : undefined
    // CC-15 (D2): capture the attestation GPS ON-DEVICE, before enqueue, so the coords
    // ride the queued payload when offline. Resolve-or-skip — this never throws and
    // never blocks: a denied/dismissed/timed-out fix returns {} and the check submits
    // with no coords. (The explainer on the review step primes the browser prompt.)
    // CC-32 (2.6): prefer the fix warmed when the review step mounted — by now it has
    // usually already resolved, so Submit lands in ~1s instead of waiting out the 10s
    // timeout. Falls back to a submit-time capture if there is no warm fix, or if the
    // vehicle changed since it was warmed (the fix must match the vehicle being filed).
    // UXP-3 (3a): BOTH branches sit under the same hard ceiling, measured from this tap.
    // A prompt left unanswered (permission limbo) never fires either callback, so the
    // 10s option above never bounds it — without the ceiling the check hung here
    // forever with nothing enqueued. Granted / denied / offline resolve long before
    // 8s and produce the exact body they always did; only limbo changes: {} at 8s.
    const warm = warmCoordsRef.current
    const coords = await withCeiling(
      warm && warm.vehicleId === vehicleId ? warm.promise : captureLocation(),
      {},
    )
    // UR-007: route through the durable offline queue (idempotency-keyed) instead
    // of a raw fetch + manual enqueue. Offline → queued exactly-once; online →
    // confirmed; a server-reached error is surfaced (the DB upsert on
    // vehicle+date+operator makes any retry safe).
    const result = await mutate({
      endpoint: '/api/daily-check',
      method: 'POST',
      body: buildPayload(coords, durationMs),
      label: 'Daily check',
    })
    setSubmitting(false)
    if (result.ok) {
      // UXP-3 (3h): the check is filed (server-confirmed or durably queued) — the
      // draft has done its job. (3j): count this vehicle as checked today so "Start
      // New Check" moves on to the next unchecked one, no refetch needed.
      clearDraft(vehicleId, businessDate())
      setCheckedToday((prev) => (prev.has(vehicleId) ? prev : new Set([...prev, vehicleId])))
    }
    if (result.ok && result.queued) {
      setSubmitted(true)
      // CC-29 item 3: an ONLINE 401 (session lapsed mid-submit) parks the write like
      // an offline enqueue but needs sign-in framing — the OfflineBanner then carries
      // the operator to /login and flush() drains on re-auth.
      if (result.reason === 'auth') {
        showToast({ message: 'Session expired — check saved on this phone. Sign in to send it.', severity: 'warning' })
      } else {
        showToast({ message: 'No network — check queued, will sync when online', severity: 'info' })
      }
    } else if (result.ok) {
      setSubmitted(true)
      showToast({ message: `Daily check submitted — ${passFail ? 'Pass ✓' : 'Fail ✗ — admin notified'}`, severity: passFail ? 'success' : 'warning' })
    } else {
      setError(result.error)
      // UXP-3 (F-05): a server 400 is the same rule set (superRefine mirrors the client
      // checks) — land on the field, same as a client-side reject. The server's own
      // message stays in the top Alert verbatim.
      if (result.status === 400) revealFirstInvalid()
    }
  }

  // UXP-3 (3h, antagonist): the form has just been reset to PRISTINE on `nextVehicleId`
  // (picker switch / "Start New Check"). If an earlier session left today's draft for
  // that vehicle, pick that check up where it was left — notice and all — instead of
  // the save effect's pristine branch deleting it. Called AFTER the caller's own
  // resets, so the draft's state and refs win. No draft → the pristine form stands.
  const restoreStoredDraft = (nextVehicleId: string) => {
    if (!nextVehicleId) return
    const draft = loadDraft(nextVehicleId, businessDate())
    if (draft) applyDraft(draft)
  }

  const handleReset = () => {
    // UXP-3 (3j): check #2 of the day goes to the next vehicle WITHOUT a check today
    // (the one just filed is in checkedToday), not back to the one just checked. All
    // checked → no preselect; the operator picks, and the notice says it replaces.
    const nextVehicleId = pickPreselect(vehicles, checkedToday)
    setChecklist(DEFAULT_CHECKLIST.map((item) => ({ ...item, value: 'yes', note: '' })))
    setIssues('')
    setOdometer('')
    // CC-32 (2.2): re-seed the site for check #2 of the day from the same last-known
    // value when the reset re-selects the SAME vehicle (the vehicle GET does not re-run
    // then). A different vehicle starts empty so the GET seeds ITS OWN last site — the
    // previous vehicle's site must never ride along untyped (the 2.2 switch rule).
    setSite(nextVehicleId === vehicleId ? (lastCheckSite ?? '') : '')
    siteTouchedRef.current = false
    issuesPrefilledRef.current = false
    setDate(businessDate())
    setSubmitted(false)
    setError('')
    setStep(0)
    startedAtRef.current = Date.now() // time the next check from a fresh start
    // CC-32 (2.6): a fresh check gets a fresh fix — never reuse the last check's.
    warmCoordsRef.current = null
    // CC-32 (2.5a): the form is pristine again, and the nonce re-fires the template
    // resolve. templateForceRef makes that resolve authoritative even if the operator
    // taps Next before it lands, so check #2 of the day always gets the admin template.
    rowsTouchedRef.current = false
    pastStep0Ref.current = false
    templateForceRef.current = true
    setStaleTemplate(false)
    setTemplateNonce((n) => n + 1)
    // UXP-3 (3h): the filed check's draft is gone (cleared at submit; belt-and-braces
    // here), and the restore notice belongs to the check that was restored.
    clearDraft(vehicleId, businessDate())
    restoredKeysRef.current = null
    setRestoredNotice(false)
    // UXP-3 (F-05): a fresh form shows no stale field errors.
    setShowNoteErrors(false)
    setIssuesError(false)
    setVehicleId(nextVehicleId)
    // UXP-3 (3h, antagonist): landing on a vehicle an earlier session left a draft on
    // picks that check up (it used to be deleted by the pristine save). Last, so the
    // draft's state and refs win over the fresh-form resets above.
    restoreStoredDraft(nextVehicleId)
  }

  if (submitted) {
    const failItems = checklist.filter((i) => i.value === 'no')
    return (
      <Box maxWidth={560}>
        <Typography variant="h5" mb={2}>Daily Check</Typography>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6">{passFail ? 'Pass' : 'Fail'}</Typography>
              <Chip label={passFail ? 'Pass ✓' : 'Fail ✗'} color={passFail ? 'success' : 'error'} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {selectedVehicleName || 'Vehicle'} · {date}{odometer ? ` · ${odometer} mi` : ''}{site ? ` · ${site}` : ''}
            </Typography>
            {failItems.length > 0 && (
              <Box>
                <Typography variant="body2" fontWeight={600} mb={0.5}>Issues found:</Typography>
                <List dense>
                  {failItems.map((i) => (
                    <ListItem key={i.key} disablePadding>
                      <ListItemText primary={i.label} secondary={i.note || undefined} />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
            {pending > 0 && (
              <Alert severity="info">{pending} daily check(s) pending sync</Alert>
            )}
            <Button variant="outlined" onClick={handleReset}>Start New Check</Button>
          </Stack>
        </Paper>
      </Box>
    )
  }


  return (
    <Box maxWidth={560}>
      <Typography variant="h5" mb={0.5}>Daily Check</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Complete before operating any vehicle.
      </Typography>

      {pending > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>{pending} daily check(s) pending sync</Alert>
      )}

      <Stepper activeStep={step} sx={{ mb: 3 }}>
        <Step><StepLabel>Vehicle &amp; Date</StepLabel></Step>
        <Step><StepLabel>Inspection</StepLabel></Step>
        <Step><StepLabel>Review &amp; Submit</StepLabel></Step>
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* UXP-3 (3h): a same-day draft came back — answers, odometer, site, and the
          step they were on. One line, dismissible; the form itself is the proof. */}
      {restoredNotice && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setRestoredNotice(false)}>
          Restored your in-progress check
        </Alert>
      )}

      {/* CC-32 (2.5b): a newer admin template arrived after answering began. Their
          answers stand; this just says which checklist this check is running on. */}
      {staleTemplate && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setStaleTemplate(false)}>
          A newer checklist for this vehicle exists — finish this check; the next one uses it.
        </Alert>
      )}

      {/* UXP-3 (3j): the selected vehicle already has a check today — a scan/redo
          deep-link, or a manual pick of the wrong truck. Same-day submit is an upsert
          (F-08 "Redo" honesty), so say so where the pick and the submit happen; the
          inspection list stays clear of banners. */}
      {step !== 1 && vehicleId && checkedToday.has(vehicleId) && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You already filed a check for {selectedVehicleName || 'this vehicle'} today — submitting replaces it.
        </Alert>
      )}

      {step === 0 && (
        <Stack spacing={2}>
          <TextField
            select
            label="Vehicle"
            value={vehicleId}
            /* CC-32 (2.5b): a DELIBERATE vehicle switch discards the answers (they
               belong to the other vehicle) and returns the form to pristine — so the
               incoming template applies silently instead of tripping the late-resolve
               guard and carrying vehicle A's answers into vehicle B's check. This
               preserves the pre-CC-32 behaviour of switching vehicles. */
            onChange={(e) => {
              const nextVehicleId = e.target.value
              // UXP-3 (3h): the answers being discarded belong to the OLD vehicle, and
              // so does its draft — drop it, or the next visit restores a check the
              // operator deliberately walked away from. (So does a restore notice for
              // it.) The NEW vehicle's draft, if an earlier session left one, is
              // restored below — the pristine save never touches it.
              clearDraft(vehicleId, businessDate())
              restoredKeysRef.current = null
              setRestoredNotice(false)
              setVehicleId(nextVehicleId)
              setChecklist((prev) => prev.map((r) => ({ ...r, value: 'yes', note: '' })))
              setIssues('')
              issuesPrefilledRef.current = false
              warmCoordsRef.current = null
              rowsTouchedRef.current = false
              pastStep0Ref.current = false
              setStaleTemplate(false)
              setShowNoteErrors(false)
              setIssuesError(false)
              // CC-32 (2.2): an UNTYPED site is the previous vehicle's prefill, so it has
              // to be cleared here — the incoming fetch only seeds an EMPTY field, so
              // leaving it would file vehicle B's check under vehicle A's site with
              // nobody having typed it. A site the operator typed is left alone: the
              // same site with a different vehicle is the normal case.
              if (!siteTouchedRef.current) setSite('')
              // UXP-3 (3h, antagonist): last, so the draft's state and refs win.
              restoreStoredDraft(nextVehicleId)
            }}
            required
            fullWidth
          >
            {vehicles.length === 0
              ? <MenuItem value="" disabled>No vehicles in active deployment</MenuItem>
              : vehicles.map((rv) => (
                <MenuItem key={rv.vehicle.id} value={rv.vehicle.id}>{rv.vehicle.name}</MenuItem>
              ))
            }
          </TextField>
          {/* CC-29 item 4a: the business date is stamped automatically at submit —
              the server ignores a client-edited value, so this is a read-only display
              (an editable field that lies invited the review's 1.1 tail finding). */}
          <TextField
            type="date"
            label="Date"
            value={date}
            fullWidth
            disabled
            InputLabelProps={{ shrink: true }}
            helperText="Set automatically"
          />
          <OdometerField value={odometer} onChange={setOdometer} lastKnown={lastOdometer} />
          {/* CC-32 (2.2): pre-filled with this vehicle's last check site when one is
              known — editable, and once the operator types here nothing overwrites it. */}
          <TextField
            label="Site / location"
            value={site}
            onChange={(e) => { siteTouchedRef.current = true; setSite(e.target.value) }}
            fullWidth
            helperText={lastCheckSite && site === lastCheckSite
              ? 'From your last check on this vehicle — edit if you moved.'
              : undefined}
          />
        </Stack>
      )}

      {step === 1 && (
        <Stack spacing={0}>
          {/* CC-32 (2.6): prime the location prompt one step earlier than the review
              caption, since the fix is now warmed when the review step mounts. */}
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
            Location is grabbed once at submit — you can say no.
          </Typography>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="body2" color="text.secondary">Check each item</Typography>
            <Chip
              label={passFail ? 'Pass ✓' : 'Fail ✗'}
              color={passFail ? 'success' : 'error'}
              size="small"
            />
          </Stack>
          <List disablePadding>
            {checklist.map((row, idx) => (
              <Box key={row.key}>
                {idx > 0 && <Divider />}
                <ListItem disablePadding sx={{ py: 1, flexDirection: 'column', alignItems: 'flex-start' }}>
                  {/* CC-23: label above a full-width 3-segment toggle so each
                      option is a 44px touch target with ≥16px text (was a
                      size="small" inline group with ~28px targets). */}
                  <Typography
                    variant="body2"
                    fontWeight={row.value === 'no' ? 700 : 400}
                    color={row.value === 'no' ? 'error' : 'text.primary'}
                    sx={{ mb: 0.75, width: '100%' }}
                  >
                    {row.label}
                  </Typography>
                  <ToggleButtonGroup
                    value={row.value}
                    exclusive
                    fullWidth
                    size="medium"
                    onChange={(_, v) => {
                      if (!v) return
                      rowsTouchedRef.current = true // CC-32 (2.5b): a row was touched
                      setChecklist((prev) =>
                        prev.map((r) => r.key === row.key ? { ...r, value: v as ChecklistRow['value'], note: v !== 'no' ? '' : r.note } : r)
                      )
                    }}
                    sx={{ '& .MuiToggleButton-root': { minHeight: 44, fontSize: 16, textTransform: 'none' } }}
                  >
                    <ToggleButton value="yes">Yes</ToggleButton>
                    <ToggleButton value="no" color="error">No</ToggleButton>
                    <ToggleButton value="na">N/A</ToggleButton>
                  </ToggleButtonGroup>
                  {row.value === 'no' && (
                    <TextField
                      size="small"
                      placeholder="Describe the issue…"
                      value={row.note}
                      onChange={(e) => {
                        rowsTouchedRef.current = true // CC-32 (2.5b): a note was typed
                        setChecklist((prev) =>
                          prev.map((r) => r.key === row.key ? { ...r, note: e.target.value } : r)
                        )
                      }}
                      fullWidth
                      sx={{ mt: 0.75 }}
                      /* UXP-3 (F-05): field-level error after a reject; typing clears it. */
                      error={showNoteErrors && !row.note.trim()}
                      helperText={showNoteErrors && !row.note.trim() ? 'Required — describe the issue' : undefined}
                      inputRef={registerField(noteFieldKey(row.key))}
                    />
                  )}
                </ListItem>
              </Box>
            ))}
          </List>
        </Stack>
      )}

      {step === 2 && (
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={0.5}>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="text.secondary">Vehicle</Typography><Typography variant="body2" fontWeight={600}>{selectedVehicleName || '—'}</Typography></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="text.secondary">Date</Typography><Typography variant="body2">{date}</Typography></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="text.secondary">Odometer</Typography><Typography variant="body2">{odometer ? `${odometer} mi` : '—'}</Typography></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="text.secondary">Site</Typography><Typography variant="body2">{site || '—'}</Typography></Stack>
              <Divider sx={{ my: 0.5 }} />
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="text.secondary">Items checked</Typography><Typography variant="body2">{checklist.length} ({checklist.filter((r) => r.value === 'yes').length} OK · {failingItems.length} fail · {checklist.filter((r) => r.value === 'na').length} N/A)</Typography></Stack>
            </Stack>
          </Paper>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body1">Result:</Typography>
            <Chip label={passFail ? 'Pass ✓' : 'Fail ✗'} color={passFail ? 'success' : 'error'} />
          </Stack>
          {!passFail && (
            <TextField
              label="Issue summary (required for fail)"
              value={issues}
              onChange={(e) => setIssues(e.target.value)}
              multiline
              rows={3}
              fullWidth
              required
              placeholder="Describe overall issues / action taken…"
              /* UXP-3 (F-05): field-level error after a reject; typing clears it. */
              error={issuesError && !issues.trim()}
              helperText={issuesError && !issues.trim() ? 'Describe the issue(s) that caused a fail' : undefined}
              inputRef={registerField(issuesFieldKey)}
            />
          )}
          {checklist.filter((r) => r.value === 'no').length > 0 && (
            <Box>
              <Typography variant="body2" fontWeight={600} mb={0.5}>Failed items:</Typography>
              <List dense>
                {checklist.filter((r) => r.value === 'no').map((r) => (
                  <ListItem key={r.key} disablePadding>
                    <ListItemText primary={r.label} secondary={r.note || undefined} />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
          {isOffline && (
            <Alert severity="warning">You are offline — check will be queued and synced when back online.</Alert>
          )}
          {/* CC-15 (D2): prime the browser location prompt (fired on Submit) with the
              trust framing. Location is optional — declining still submits the check. */}
          <Typography variant="caption" color="text.secondary">
            Location is saved once per daily check so the team can see where rigs have been — never live tracking.
          </Typography>
        </Stack>
      )}

      <Stack direction="row" spacing={1} mt={3}>
        {step > 0 && (
          <Button onClick={() => setStep((s) => s - 1)} disabled={submitting}>Back</Button>
        )}
        {step < 2 ? (
          <Button
            variant="contained"
            onClick={() => {
              if (step === 0 && !vehicleId) { setError('Select a vehicle'); return }
              // UXP-3 (F-05): the reject lands on the failing row, not just up top.
              if (step === 1 && missingItemNote) { setError('Add a note for each item marked “No”.'); revealFirstInvalid(); return }
              setShowNoteErrors(false)
              // CC-32 (2.5b): past step 0 the form is no longer pristine, even if every
              // row still reads "yes" — a late template must not restart their check.
              pastStep0Ref.current = true
              // CC-32 (2.1): a failed check used to demand the same information twice —
              // a required note per failed item AND a required overall summary. Seed the
              // summary from the per-item notes on the way into review. One-shot and
              // only while empty, so a summary the operator typed is never overwritten
              // (and clearing it then stepping back and forward does not re-fill it).
              // The per-item notes stay required — they feed the viewer's per-item display.
              if (step === 1 && !issuesPrefilledRef.current && !issues.trim()) {
                const fails = checklist.filter((r) => r.value === 'no')
                if (fails.length > 0) {
                  issuesPrefilledRef.current = true
                  setIssues(fails.map((r) => `${r.label}: ${r.note.trim()}`).join('\n'))
                }
              }
              setError('')
              setStep((s) => s + 1)
            }}
          >
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {submitting ? 'Submitting…' : 'Submit Check'}
          </Button>
        )}
      </Stack>
    </Box>
  )
}
