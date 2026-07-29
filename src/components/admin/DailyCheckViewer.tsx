'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, IconButton, Typography, Stack, Box, Chip, Divider,
  List, ListItem, ListItemText, CircularProgress, Button, Checkbox, FormControlLabel,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import PlaceIcon from '@mui/icons-material/Place'
import BuildIcon from '@mui/icons-material/Build'
import { useRouter } from 'next/navigation'
import { PhotoGallery } from '@/components/shared/PhotoGallery'
import { useToast } from '@/components/shared/useToast'
import { formatDate } from '@/lib/utils'

// CC-26: read-only daily-check viewer — the surface that shows a submitted check's FULL
// contents so a diligent check and a pencil-whipped one are distinguishable (the
// data-quality falsifier). Nothing here is writable.

export interface ViewerCheckPhoto {
  id: string
  url: string
  thumbnailUrl: string | null
  takenAt: string
  context?: string
  gpsLat: number | null
  gpsLng: number | null
}

export interface ViewerCheck {
  id: string
  date: string
  submittedAt: string
  passFail: boolean
  odometer: number | null
  site: string | null
  issues: string | null
  durationMs: number | null
  checklistJson: { key: string; label: string; value: 'yes' | 'no' | 'na'; note?: string }[]
  operator: { id: string; name: string } | null
  vehicle: { id: string; name: string; type: string } | null
  photos: ViewerCheckPhoto[]
  // CC-15 adds check-level GPS later; render if present, absent-safe otherwise.
  gpsLat?: number | null
  gpsLng?: number | null
}

function formatDuration(ms: number | null): string | null {
  if (ms == null || ms < 0) return null
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem ? `${m}m ${rem}s` : `${m}m`
}

const VALUE_LABEL: Record<string, string> = { yes: 'Yes', no: 'No', na: 'N/A' }

// Presentational — takes the fully-resolved check and renders it read-only. Split out so
// it's unit-testable (with and without photos / GPS) without mocking a fetch.
export function DailyCheckDetails({ check }: { check: ViewerCheck }) {
  const duration = formatDuration(check.durationMs)
  const hasCheckGps = check.gpsLat != null && check.gpsLng != null
  const photosWithGps = check.photos.filter((p) => p.gpsLat != null && p.gpsLng != null)

  return (
    <Stack spacing={2}>
      {/* Header: who / what / when / outcome */}
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
        {check.passFail
          ? <Chip icon={<CheckCircleIcon />} label="Pass" color="success" size="small" />
          : <Chip icon={<CancelIcon />} label="Fail" color="error" size="small" />}
        <Typography variant="body2" color="text.secondary">
          {check.vehicle?.name ?? 'Vehicle'} · {check.operator?.name ?? 'Unknown operator'} · {formatDate(check.date)}
        </Typography>
      </Stack>

      {/* Reading facts */}
      <Stack spacing={0.5}>
        <FactRow label="Odometer" value={check.odometer != null ? `${check.odometer.toLocaleString()} mi` : '—'} />
        <FactRow label="Site" value={check.site || '—'} />
        {duration && <FactRow label="Time to complete" value={duration} />}
      </Stack>

      <Divider />

      {/* The checklist answers — the whole point. Failures highlighted. */}
      <Box>
        <Typography variant="subtitle2" gutterBottom>Checklist ({check.checklistJson.length})</Typography>
        <List dense disablePadding>
          {check.checklistJson.map((item) => {
            const failed = item.value === 'no'
            return (
              <ListItem key={item.key} disablePadding sx={{ py: 0.25 }}>
                <ListItemText
                  primary={
                    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                      <Typography variant="body2" color={failed ? 'error' : 'text.primary'} fontWeight={failed ? 700 : 400}>
                        {item.label}
                      </Typography>
                      <Chip
                        label={VALUE_LABEL[item.value] ?? item.value}
                        size="small"
                        color={failed ? 'error' : item.value === 'na' ? 'default' : 'success'}
                        variant={failed ? 'filled' : 'outlined'}
                      />
                    </Stack>
                  }
                  secondary={failed && item.note ? item.note : undefined}
                  secondaryTypographyProps={{ color: 'error' }}
                />
              </ListItem>
            )
          })}
        </List>
      </Box>

      {check.issues && (
        <Box>
          <Typography variant="subtitle2" gutterBottom>Issue summary</Typography>
          <Typography variant="body2" color="text.secondary">{check.issues}</Typography>
        </Box>
      )}

      {/* GPS slot — CC-15 adds check-level coords; render them if the field is present,
          otherwise show per-photo GPS if any, else a clearly-marked empty slot. */}
      <Box>
        <Typography variant="subtitle2" gutterBottom>Location (GPS)</Typography>
        {hasCheckGps ? (
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: 'text.secondary' }}>
            <PlaceIcon fontSize="small" />
            <Typography variant="body2">{check.gpsLat!.toFixed(5)}, {check.gpsLng!.toFixed(5)}</Typography>
          </Stack>
        ) : photosWithGps.length > 0 ? (
          <Typography variant="body2" color="text.secondary">
            No check-level GPS; {photosWithGps.length} photo{photosWithGps.length === 1 ? '' : 's'} carry location.
          </Typography>
        ) : (
          <Typography variant="body2" color="text.disabled">Not captured on this check.</Typography>
        )}
      </Box>

      {/* Photos — read-only gallery. */}
      <Box>
        <Typography variant="subtitle2" gutterBottom>Photos ({check.photos.length})</Typography>
        {check.photos.length === 0
          ? <Typography variant="body2" color="text.disabled">No photos.</Typography>
          : <PhotoGallery photos={check.photos.map((p) => ({ id: p.id, url: p.url, thumbnailUrl: p.thumbnailUrl ?? undefined, takenAt: p.takenAt, context: p.context }))} />}
      </Box>
    </Stack>
  )
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" justifyContent="space-between">
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  )
}

// The Dialog wrapper: fetches the check by id when opened and renders the read-only
// details. Reachable from the vehicle drawer, the deployment drawer, and a failed-check
// alert deep-link (?check=<id> on /admin/vehicles).
export function DailyCheckViewer({ checkId, open, onClose }: { checkId: string | null; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const showToast = useToast()
  const [check, setCheck] = React.useState<ViewerCheck | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // CC-34 (2c): admin can promote a failing check into a repair task (never automatic).
  const [flipVehicle, setFlipVehicle] = React.useState(false)
  const [opening, setOpening] = React.useState(false)

  async function openRepairTask() {
    if (!check) return
    setOpening(true)
    try {
      const res = await fetch(`/api/daily-check/${check.id}/open-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flipVehicle }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast({ message: typeof d.error === 'string' ? d.error : 'Could not open a repair task.', severity: 'error' })
        return
      }
      onClose()
      router.push(`/admin/maintenance?task=${d.data.id}`)
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    } finally {
      setOpening(false)
    }
  }

  React.useEffect(() => {
    if (!open || !checkId) return
    let active = true
    setLoading(true)
    setError(null)
    setCheck(null)
    setFlipVehicle(false)
    fetch(`/api/daily-check/${checkId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? 'This check could not be found.' : 'Could not load this check.'))))
      .then((d) => { if (active) setCheck(d.data as ViewerCheck) })
      .catch((e) => { if (active) setError(e.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open, checkId])

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Daily check
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading && <Stack alignItems="center" py={4}><CircularProgress /></Stack>}
        {error && <Typography color="error" variant="body2">{error}</Typography>}
        {check && <DailyCheckDetails check={check} />}
        {/* CC-34 (2c): on a failing check, promote it to a repair task in one click —
            the operator's words + the check's photos carry over; two clicks from the bell. */}
        {check && !check.passFail && (
          <Box mt={2}>
            <Divider sx={{ mb: 1.5 }} />
            <FormControlLabel
              control={<Checkbox checked={flipVehicle} onChange={(e) => setFlipVehicle(e.target.checked)} />}
              label="Also take the vehicle out of service"
            />
            <Button
              variant="contained" color="warning" fullWidth startIcon={<BuildIcon />}
              disabled={opening} onClick={openRepairTask} sx={{ mt: 1 }}
            >
              {opening ? 'Opening…' : 'Open repair task from this check'}
            </Button>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}
