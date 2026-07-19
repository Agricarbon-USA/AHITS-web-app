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
        setChecklist(items.map((it) => ({ key: it.key, label: it.label, value: 'yes', note: '' })))
      })
      .catch(() => { /* offline — keep the current (default) list */ })
    return () => { active = false }
  }, [vehicleId, selectedVehicleType])

  // CC-14 (NS-5): fetch the selected vehicle's last-known odometer for the sanity
  // warning. Keyed on vehicleId so it re-reads when the operator switches vehicles;
  // offline / not-found leaves it null (the warning simply stays quiet).
  React.useEffect(() => {
    if (!vehicleId) { setLastOdometer(null); return }
    let active = true
    fetch(`/api/vehicles/${vehicleId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active) setLastOdometer(typeof d?.data?.odometer === 'number' ? d.data.odometer : null) })
      .catch(() => { if (active) setLastOdometer(null) })
    return () => { active = false }
  }, [vehicleId])

  const passFail = checklist.every((item) => item.value !== 'no')
  const failingItems = checklist.filter((item) => item.value === 'no')
  // PRD §11.4 / §7.4: a reason is required on every failed item, not just an
  // overall summary. Enforced client-side here and again server-side.
  const missingItemNote = failingItems.some((item) => !item.note.trim())
  const selectedVehicleName =
    vehicles.find((rv) => rv.vehicle.id === vehicleId)?.vehicle.name ?? ''

  const buildPayload = () => ({
    vehicleId,
    date,
    odometer: odometer ? parseInt(odometer) : undefined,
    site: site || undefined,
    checklistJson: checklist.map(({ key, label, value, note }) => ({ key, label, value, note: note || undefined })),
    issues: issues || undefined,
    passFail,
    // CC-14: passive time-to-complete, measured at submit-click (correct even if the
    // check later syncs from the offline queue). undefined until the mount clock starts.
    durationMs: startedAtRef.current ? Date.now() - startedAtRef.current : undefined,
  })

  const handleSubmit = async () => {
    if (!vehicleId) { setError('Select a vehicle'); return }
    if (missingItemNote) { setError('Add a note for each item marked “No”.'); setStep(1); return }
    if (!passFail && !issues.trim()) { setError('Describe the issue(s) that caused a fail'); return }
    setSubmitting(true)
    setError('')
    // UR-007: route through the durable offline queue (idempotency-keyed) instead
    // of a raw fetch + manual enqueue. Offline → queued exactly-once; online →
    // confirmed; a server-reached error is surfaced (the DB upsert on
    // vehicle+date+operator makes any retry safe).
    const result = await mutate({
      endpoint: '/api/daily-check',
      method: 'POST',
      body: buildPayload(),
      label: 'Daily check',
    })
    setSubmitting(false)
    if (result.ok && result.queued) {
      setSubmitted(true)
      showToast({ message: 'No network — check queued, will sync when online', severity: 'info' })
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
    setSite('')
    setDate(businessDate())
    setSubmitted(false)
    setError('')
    setStep(0)
    startedAtRef.current = Date.now() // time the next check from a fresh start
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

      {step === 0 && (
        <Stack spacing={2}>
          <TextField
            select
            label="Vehicle"
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
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
          <TextField
            type="date"
            label="Date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <OdometerField value={odometer} onChange={setOdometer} lastKnown={lastOdometer} />
          <TextField
            label="Site / location"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            fullWidth
          />
        </Stack>
      )}

      {step === 1 && (
        <Stack spacing={0}>
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
                      onChange={(e) => setChecklist((prev) =>
                        prev.map((r) => r.key === row.key ? { ...r, note: e.target.value } : r)
                      )}
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
