'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack, TextField,
  Typography, ToggleButton, ToggleButtonGroup, IconButton, Tooltip,
} from '@mui/material'
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined'
import { PhotoCapture } from './PhotoCapture'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { useToast } from '@/components/shared/useToast'

// CC-34 (2a): ONE operator verb for "something is wrong with this thing." Replaces the
// remove-from-kit-via-DispositionDialog path for units (annotation, not removal) and the
// bespoke online-only vehicle report-damage dialog. The four damage vocabularies collapse
// here (D29-2): the operator says what + a photo + optional self-triage; the admin triages
// severity. Submits through the offline queue so it works in the field (airplane mode).

export interface ReportProblemSubject {
  kind: 'unit' | 'vehicle'
  id: string
  name: string
}

const TOUCH_SX = { minHeight: 44, fontSize: 16 } as const // CC-23 field-target discipline

export function ReportProblemDialog({
  open, onClose, subject, onReported,
}: {
  open: boolean
  onClose: () => void
  subject: ReportProblemSubject | null
  /** Fired after a successful submit (server-applied or queued) so a mount can refetch. */
  onReported?: (result: { queued: boolean }) => void
}) {
  const { mutate } = useOfflineQueue()
  const showToast = useToast()
  const [notes, setNotes] = React.useState('')
  const [photoUrls, setPhotoUrls] = React.useState<string[]>([])
  const [stillUsable, setStillUsable] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  // Reset each time a fresh subject is opened.
  React.useEffect(() => {
    if (open) { setNotes(''); setPhotoUrls([]); setStillUsable(true); setSaving(false) }
  }, [open, subject?.id])

  if (!subject) return null
  const isUnit = subject.kind === 'unit'
  // UXP-3 (3g) / D36: a photo is NEVER required to submit — a denied/missing camera must
  // not block a report. Units used to hard-require ≥1 photo (§11.10, client AND server);
  // now the photo is a strong nudge and a photo-less unit report is labelled as such on
  // the button, so the operator sends it knowingly (one tap, no confirm — gloves).
  const canSubmit = !!notes.trim() && !saving
  const withoutPhoto = isUnit && photoUrls.length === 0

  async function submit() {
    if (!subject) return
    setSaving(true)
    const endpoint = isUnit
      ? `/api/inventory/units/${subject.id}/report-problem`
      : `/api/vehicles/${subject.id}/report-damage`
    const result = await mutate({
      endpoint,
      method: 'POST',
      // photoUrls may carry localphoto: refs while offline; the queue resolves them to real
      // URLs before sending, and the route rejects any that slip through (422).
      body: { notes: notes.trim(), photoUrls, stillUsable },
      label: `Report a problem — ${subject.name}`,
    })
    setSaving(false)
    if (!result.ok) {
      showToast({ message: result.error || 'Could not report the problem.', severity: 'error' })
      return
    }
    showToast({
      message: result.queued
        ? 'Saved on this phone — it will sync when you are back online.'
        : 'Reported. An admin will follow up.',
      severity: result.queued ? 'info' : 'success',
    })
    onReported?.({ queued: !!result.queued })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Report a problem — {subject.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} pt={0.5}>
          <TextField
            label="What happened"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={3}
            fullWidth
            required
            placeholder="Describe the problem"
          />

          <PhotoCapture value={photoUrls} onChange={setPhotoUrls} label="Add photo" />
          <Typography variant="caption" color="text.secondary">
            {isUnit
              ? 'Add at least one photo if you can — it helps the admin triage.'
              : 'Add a photo if you can.'}
          </Typography>

          <ToggleButtonGroup
            exclusive
            fullWidth
            value={stillUsable ? 'usable' : 'oos'}
            onChange={(_e, v) => { if (v) setStillUsable(v === 'usable') }}
            sx={{ '& .MuiToggleButton-root': TOUCH_SX }}
          >
            <ToggleButton value="usable">Still usable</ToggleButton>
            <ToggleButton value="oos">Out of service</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary">
            {stillUsable
              ? 'Stays in your kit. An admin will follow up.'
              : 'Marked In Maintenance — unusable until repaired.'}
          </Typography>

          <Typography variant="caption" color="text.secondary">
            Reporting keeps it in your kit — use Return to Hub to send it back.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving} sx={TOUCH_SX}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!canSubmit} sx={TOUCH_SX}>
          {saving ? 'Reporting…' : withoutPhoto ? 'Report without photo' : 'Report'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// CC-34 (2a): a self-contained 44px trigger + dialog for a single row. Kept as its own
// component (not inlined into the memoized DeploymentCards bodies) so its open-state and
// the dialog's useOfflineQueue don't re-render the whole kit/vehicle list — the CC-12
// memo boundary stays intact. Distinct icon/color, placed LEFT of the row's ⊖ (RIDER C 2a-b).
export function ReportProblemButton({
  subject, onReported,
}: {
  subject: ReportProblemSubject
  onReported?: (result: { queued: boolean }) => void
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Tooltip title="Report a problem">
        <IconButton size="small" color="warning" sx={{ width: 44, height: 44 }}
          onClick={() => setOpen(true)} aria-label="Report a problem">
          <ReportProblemOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {/* Mount the dialog (and its useOfflineQueue/useToast) only once opened, so a bare
          per-row button carries no queue/toast dependency until the operator taps it. */}
      {open && (
        <ReportProblemDialog open subject={subject} onClose={() => setOpen(false)} onReported={onReported} />
      )}
    </>
  )
}
