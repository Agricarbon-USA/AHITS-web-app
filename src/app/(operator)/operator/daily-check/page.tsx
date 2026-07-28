'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Stack, Alert, Chip, CircularProgress,
  Stepper, Step, StepLabel, TextField, List, ListItem, ListItemText,
  ToggleButtonGroup, ToggleButton, MenuItem, Paper, Divider,
} from '@mui/material'
import { useToast } from '@/components/shared/useToast'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { businessDate } from '@/lib/business-date'
import { DEFAULT_DAILY_CHECKLIST } from '@/types'
import { OdometerField } from '@/components/operator/OdometerField'

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

interface RigVehicle {
  id: string
  vehicle: { id: string; name: string; type?: string }
}

interface ActiveRig {
  id: string
  vehicles: RigVehicle[]
}

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

  // The selectable vehicles: the active-rig vehicles, plus a scanned vehicle that
  // isn't on the rig (so QR-scanning any vehicle opens a usable daily check).
  const vehicles = React.useMemo<RigVehicle[]>(() => {
    const base = rig?.vehicles ?? []
    if (scannedVehicle && !base.some((rv) => rv.vehicle.id === scannedVehicle.id)) {
      return [{ id: scannedVehicle.id, vehicle: { id: scannedVehicle.id, name: scannedVehicle.name, type: scannedVehicle.type } }, ...base]
    }
    return base
  }, [rig, scannedVehicle])

  React.useEffect(() => {
    startedAtRef.current = Date.now() // start the time-to-complete clock at mount
    // A scan of a vehicle label routes here as ?vehicleId=<id> (PRD §7.7) —
    // preselect it when present.
    const preselect =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('vehicleId')
        : null
    if (preselect) {
      setVehicleId(preselect)
      // Fetch the scanned vehicle's details so it renders even if it's not on
      // the operator's active rig (any-vehicle daily check, UR-033).
      fetch(`/api/vehicles/${preselect}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const v = d?.data
          if (v?.id) setScannedVehicle({ id: v.id, name: v.name, type: v.type })
        })
        .catch(() => { /* offline / not found — fall back to rig vehicles */ })
    }
    fetch('/api/deployments')
      .then((r) => r.json())
      .then((json) => {
        const active: ActiveRig | null = json[0] ?? null
        setRig(active)
        if (!preselect && active?.vehicles?.[0]) setVehicleId(active.vehicles[0].vehicle.id)
      })
      .catch(() => {})
  }, [])

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

  const passFail = checklist.every((item) => item.value !== 'no')
  const failingItems = checklist.filter((item) => item.value === 'no')
  // PRD §11.4 / §7.4: a reason is required on every failed item, not just an
  // overall summary. Enforced client-side here and again server-side.
  const missingItemNote = failingItems.some((item) => !item.note.trim())
  const selectedVehicleName =
    vehicles.find((rv) => rv.vehicle.id === vehicleId)?.vehicle.name ?? ''

  const buildPayload = (coords: CheckCoords = {}) => ({
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
    // check later syncs from the offline queue). undefined until the mount clock starts.
    durationMs: startedAtRef.current ? Date.now() - startedAtRef.current : undefined,
    // CC-15 (D2): attestation GPS captured just before enqueue; the keys are absent when
    // location was unavailable, so the payload — online or queued offline — carries no
    // coords rather than nulls.
    ...coords,
  })

  const handleSubmit = async () => {
    if (!vehicleId) { setError('Select a vehicle'); return }
    if (missingItemNote) { setError('Add a note for each item marked “No”.'); setStep(1); return }
    if (!passFail && !issues.trim()) { setError('Describe the issue(s) that caused a fail'); return }
    setSubmitting(true)
    setError('')
    // CC-15 (D2): capture the attestation GPS ON-DEVICE, before enqueue, so the coords
    // ride the queued payload when offline. Resolve-or-skip — this never throws and
    // never blocks: a denied/dismissed/timed-out fix returns {} and the check submits
    // with no coords. (The explainer on the review step primes the browser prompt.)
    // CC-32 (2.6): prefer the fix warmed when the review step mounted — by now it has
    // usually already resolved, so Submit lands in ~1s instead of waiting out the 10s
    // timeout. Falls back to a submit-time capture if there is no warm fix, or if the
    // vehicle changed since it was warmed (the fix must match the vehicle being filed).
    const warm = warmCoordsRef.current
    const coords = warm && warm.vehicleId === vehicleId ? await warm.promise : await captureLocation()
    // UR-007: route through the durable offline queue (idempotency-keyed) instead
    // of a raw fetch + manual enqueue. Offline → queued exactly-once; online →
    // confirmed; a server-reached error is surfaced (the DB upsert on
    // vehicle+date+operator makes any retry safe).
    const result = await mutate({
      endpoint: '/api/daily-check',
      method: 'POST',
      body: buildPayload(coords),
      label: 'Daily check',
    })
    setSubmitting(false)
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
    }
  }

  const handleReset = () => {
    setChecklist(DEFAULT_CHECKLIST.map((item) => ({ ...item, value: 'yes', note: '' })))
    setIssues('')
    setOdometer('')
    // CC-32 (2.2): re-seed the site for check #2 of the day from the same last-known
    // value (the vehicle GET does not re-run when reset re-selects the same vehicle).
    setSite(lastCheckSite ?? '')
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
    if (rig?.vehicles?.[0]) setVehicleId(rig.vehicles[0].vehicle.id)
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

      {/* CC-32 (2.5b): a newer admin template arrived after answering began. Their
          answers stand; this just says which checklist this check is running on. */}
      {staleTemplate && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setStaleTemplate(false)}>
          A newer checklist for this vehicle exists — finish this check; the next one uses it.
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
              setVehicleId(e.target.value)
              setChecklist((prev) => prev.map((r) => ({ ...r, value: 'yes', note: '' })))
              setIssues('')
              issuesPrefilledRef.current = false
              warmCoordsRef.current = null
              rowsTouchedRef.current = false
              pastStep0Ref.current = false
              setStaleTemplate(false)
              // CC-32 (2.2): an UNTYPED site is the previous vehicle's prefill, so it has
              // to be cleared here — the incoming fetch only seeds an EMPTY field, so
              // leaving it would file vehicle B's check under vehicle A's site with
              // nobody having typed it. A site the operator typed is left alone: the
              // same site with a different vehicle is the normal case.
              if (!siteTouchedRef.current) setSite('')
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
              if (step === 1 && missingItemNote) { setError('Add a note for each item marked “No”.'); return }
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
