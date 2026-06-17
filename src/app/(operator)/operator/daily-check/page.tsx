'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Stack, Alert, Chip, CircularProgress,
  Stepper, Step, StepLabel, TextField, List, ListItem, ListItemText,
  ToggleButtonGroup, ToggleButton, MenuItem, Paper, Divider,
} from '@mui/material'
import { useToast } from '@/components/shared/useToast'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'

const DEFAULT_CHECKLIST = [
  { key: 'tires', label: 'Tires / inflation' },
  { key: 'lights', label: 'Lights / signals' },
  { key: 'fluids', label: 'Fluid levels (oil, coolant, brake)' },
  { key: 'brakes', label: 'Brakes' },
  { key: 'wipers', label: 'Windshield / wipers' },
  { key: 'mirrors', label: 'Mirrors' },
  { key: 'safety_kit', label: 'Safety kit present (first aid, fire ext.)' },
  { key: 'damage', label: 'No new visible damage' },
  { key: 'cleanliness', label: 'Vehicle is clean and secured' },
]

interface ChecklistRow {
  key: string
  label: string
  value: 'yes' | 'no' | 'na'
  note: string
}

interface RigVehicle {
  id: string
  vehicle: { id: string; name: string }
}

interface ActiveRig {
  id: string
  vehicles: RigVehicle[]
}

export default function OperatorDailyCheckPage() {
  const showToast = useToast()
  const { enqueue, pending, isOffline } = useOfflineQueue()

  const [rig, setRig] = React.useState<ActiveRig | null>(null)
  const [vehicleId, setVehicleId] = React.useState('')
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10))
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

  React.useEffect(() => {
    // A scan of a vehicle label routes here as ?vehicleId=<id> (PRD §7.7) —
    // preselect it when present.
    const preselect =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('vehicleId')
        : null
    if (preselect) setVehicleId(preselect)
    fetch('/api/deployments')
      .then((r) => r.json())
      .then((json) => {
        const active: ActiveRig | null = json[0] ?? null
        setRig(active)
        if (!preselect && active?.vehicles?.[0]) setVehicleId(active.vehicles[0].vehicle.id)
      })
      .catch(() => {})
  }, [])

  const passFail = checklist.every((item) => item.value !== 'no')

  const buildPayload = () => ({
    vehicleId,
    date,
    odometer: odometer ? parseInt(odometer) : undefined,
    site: site || undefined,
    checklistJson: checklist.map(({ key, label, value, note }) => ({ key, label, value, note: note || undefined })),
    issues: issues || undefined,
    passFail,
  })

  const handleSubmit = async () => {
    if (!vehicleId) { setError('Select a vehicle'); return }
    if (!passFail && !issues.trim()) { setError('Describe the issue(s) that caused a fail'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/daily-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      if (res.ok) {
        setSubmitted(true)
        showToast({ message: `Daily check submitted — ${passFail ? 'Pass ✓' : 'Fail ✗ — admin notified'}`, severity: passFail ? 'success' : 'warning' })
      } else {
        const d = await res.json()
        setError(d.error?.formErrors?.[0] ?? d.error ?? 'Submission failed')
      }
    } catch {
      await enqueue({ endpoint: '/api/daily-check', method: 'POST', body: buildPayload() })
      setSubmitted(true)
      showToast({ message: 'No network — check queued, will sync when online', severity: 'info' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    setChecklist(DEFAULT_CHECKLIST.map((item) => ({ ...item, value: 'yes', note: '' })))
    setIssues('')
    setOdometer('')
    setSite('')
    setDate(new Date().toISOString().slice(0, 10))
    setSubmitted(false)
    setError('')
    setStep(0)
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

  const vehicles = rig?.vehicles ?? []

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
          <TextField
            label="Odometer (km)"
            type="number"
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            fullWidth
            inputProps={{ min: 0 }}
          />
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
                  <Stack direction="row" justifyContent="space-between" alignItems="center" width="100%">
                    <Typography
                      variant="body2"
                      fontWeight={row.value === 'no' ? 700 : 400}
                      color={row.value === 'no' ? 'error' : 'text.primary'}
                    >
                      {row.label}
                    </Typography>
                    <ToggleButtonGroup
                      value={row.value}
                      exclusive
                      size="small"
                      onChange={(_, v) => {
                        if (!v) return
                        setChecklist((prev) =>
                          prev.map((r) => r.key === row.key ? { ...r, value: v as ChecklistRow['value'], note: v !== 'no' ? '' : r.note } : r)
                        )
                      }}
                    >
                      <ToggleButton value="yes" sx={{ px: 1.5 }}>Yes</ToggleButton>
                      <ToggleButton value="no" color="error" sx={{ px: 1.5 }}>No</ToggleButton>
                      <ToggleButton value="na" sx={{ px: 1.5 }}>N/A</ToggleButton>
                    </ToggleButtonGroup>
                  </Stack>
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
