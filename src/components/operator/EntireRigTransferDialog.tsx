'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Stack, Chip, TextField,
  Typography, CircularProgress,
} from '@mui/material'
import { SearchableSelect, type SelectOption } from '@/components/shared/SearchableSelect'

// CC-33 (D22 / anti-regrowth): the entire-rig transfer initiate dialog, extracted
// from my-deployment/page.tsx into its own file (net-line reduction rule). This is
// today's handoff: ownership of record flips to the recipient on accept. State +
// submit stay in the page (DeploymentCards precedent) — this is presentational only.
export function EntireRigTransferDialog({
  open,
  onClose,
  operatorOptions,
  targetId,
  onTargetChange,
  note,
  onNoteChange,
  notePresets,
  loading,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  operatorOptions: SelectOption[]
  targetId: string
  onTargetChange: (id: string) => void
  note: string
  onNoteChange: (note: string) => void
  notePresets: readonly string[]
  loading: boolean
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Transfer — Entire Rig</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Hands the whole deployment to them. Once they accept, they become the primary
          operator — daily checks and gear custody move to them.
        </Typography>
        <Box sx={{ mb: 2 }}>
          <SearchableSelect
            label="Transfer to"
            value={targetId}
            onChange={onTargetChange}
            options={operatorOptions}
          />
        </Box>
        {/* CC-32 (2.3): the note is optional now — one-tap presets fill it, free text
            stays available, and the transfer no longer requires typing at all. */}
        <Stack direction="row" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
          {notePresets.map((p) => (
            <Chip key={p} label={p} size="small" variant="outlined" onClick={() => onNoteChange(p)} />
          ))}
        </Stack>
        <TextField
          label="Note (optional)"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          multiline rows={2} fullWidth
          placeholder="e.g. Heading home — covering the weekend"
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" color="warning"
          disabled={!targetId || loading}
          onClick={onSubmit}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}>
          {loading ? 'Sending…' : 'Send Transfer Request'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
