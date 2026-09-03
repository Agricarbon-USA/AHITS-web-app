'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Typography, Stack, CircularProgress, Button,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ReplayIcon from '@mui/icons-material/Replay'
import { DailyCheckDetails, type ViewerCheck } from '@/components/admin/DailyCheckViewer'
import { useHistoryGuard } from '@/hooks/useHistoryGuard'
import { businessDate } from '@/lib/business-date'

// UXP-3 (F-08): what "Done" means. Tapping a checked vehicle on Today opens the check
// the operator filed for it today — the same read-only CC-26 contents an admin sees —
// plus one honest action: redo it (the same-day upsert REPLACES today's row, so the
// button says so). Zero server changes: two operator-scoped reads that already exist
// (the list route forces operatorId = self; the [id] route allows own checks only).
// The presentational `DailyCheckDetails` is reused; the admin `DailyCheckViewer` dialog
// is NOT (it carries the admin-only open-repair-task action).

interface Props {
  vehicleId: string | null
  open: boolean
  onClose: () => void
  onRedo: (vehicleId: string) => void
}

type Loaded =
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'ready'; check: ViewerCheck }

export const NO_CHECK_TODAY = 'No check found for today.'
export const CHECK_LOAD_ERROR = "Couldn't load today's check — check your connection."
export const REDO_LABEL = "Redo check (replaces today's)"

export function TodayCheckSummary({ vehicleId, open, onClose, onRedo }: Props) {
  // UXP-1e: hardware/browser Back closes the dialog instead of leaving Today.
  useHistoryGuard(open, onClose)
  // The result is keyed by the vehicle it was fetched for; "loading" is DERIVED (no
  // result for the vehicle on screen) rather than set in the effect, and the result is
  // cleared once the dialog has fully closed — so every open starts from a fresh fetch.
  const [result, setResult] = React.useState<{ key: string; loaded: Loaded } | null>(null)
  // While the dialog fades out the parent has already nulled `vehicleId`; keep showing
  // the check we have instead of flashing a spinner over the exit animation.
  const shownVehicleId = vehicleId ?? result?.key ?? null
  const loaded = result && result.key === shownVehicleId ? result.loaded : null

  React.useEffect(() => {
    if (!open || !vehicleId) return
    let active = true
    const key = vehicleId
    ;(async () => {
      try {
        // Same business-day key the check was filed under (FND-7) and that Today's
        // `checkedVehicleIds` is computed from — so "Done" and this read agree.
        const listRes = await fetch(
          `/api/daily-check?vehicleId=${encodeURIComponent(key)}&date=${businessDate()}&pageSize=1`,
        )
        if (!listRes.ok) throw new Error(`list ${listRes.status}`)
        const list = await listRes.json()
        const id: string | undefined = list?.data?.[0]?.id
        if (!id) {
          if (active) setResult({ key, loaded: { status: 'empty' } })
          return
        }
        const res = await fetch(`/api/daily-check/${encodeURIComponent(id)}`)
        if (res.status === 404) {
          if (active) setResult({ key, loaded: { status: 'empty' } })
          return
        }
        if (!res.ok) throw new Error(`detail ${res.status}`)
        const d = await res.json()
        if (active) setResult({ key, loaded: { status: 'ready', check: d.data as ViewerCheck } })
      } catch {
        if (active) setResult({ key, loaded: { status: 'error' } })
      }
    })()
    return () => { active = false }
  }, [open, vehicleId])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ transition: { onExited: () => setResult(null) } }}
    >
      <DialogTitle sx={{ pr: 6 }}>
        Daily check
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {!loaded && <Stack alignItems="center" py={4}><CircularProgress /></Stack>}
        {loaded?.status === 'empty' && <Typography color="text.secondary" variant="body2">{NO_CHECK_TODAY}</Typography>}
        {loaded?.status === 'error' && <Typography color="error" variant="body2">{CHECK_LOAD_ERROR}</Typography>}
        {loaded?.status === 'ready' && <DailyCheckDetails check={loaded.check} />}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {/* The redo lands on the existing ?vehicleId= deep-link; the daily-check page's
            own "already filed today — submitting replaces it" notice (3j) carries the
            rest of the honesty. Offered in every loaded state — the Done state that
            opened this dialog is the reason the operator is here. 44px per CC-23. */}
        <Button
          variant="outlined"
          startIcon={<ReplayIcon />}
          disabled={!vehicleId || !loaded}
          onClick={() => { if (vehicleId) onRedo(vehicleId) }}
          sx={{ minHeight: 44 }}
        >
          {REDO_LABEL}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
