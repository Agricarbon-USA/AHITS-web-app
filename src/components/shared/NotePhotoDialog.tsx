'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Stack, Chip,
} from '@mui/material'

interface NotePhotoDialogProps {
  open: boolean
  title: string
  description?: string
  loading?: boolean
  onClose: () => void
  /** P1-1b (3.2): return (or resolve) `false` to keep the note — e.g. the write failed. REQ-D: no photos are asked for here; `photoUrls` is always []. */
  onConfirm: (note: string, photoUrls: string[]) => void | boolean | Promise<void | boolean>
  confirmLabel?: string
  confirmColor?: 'primary' | 'error' | 'warning' | 'success' | 'inherit'
  /** CC-24: one-tap note presets shown above the (optional) note field. */
  presets?: readonly string[]
}

export function NotePhotoDialog({
  open,
  title,
  description,
  loading = false,
  onClose,
  onConfirm,
  confirmLabel = 'Confirm',
  confirmColor = 'primary',
  presets,
}: NotePhotoDialogProps) {
  const [note, setNote] = React.useState('')

  async function handleConfirm() {
    let r
    try { r = await onConfirm(note, []) } catch { return }
    if (r === false) return
    setNote('')
  }

  function handleClose() {
    setNote('')
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {description && (
          <Typography variant="body2" color="text.secondary" mb={2}>
            {description}
          </Typography>
        )}
        {presets && presets.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 1 }} flexWrap="wrap" useFlexGap>
            {presets.map((p) => (
              <Chip key={p} label={p} size="small" variant="outlined" onClick={() => setNote(p)} />
            ))}
          </Stack>
        )}
        <TextField
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          multiline
          rows={3}
          fullWidth
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          color={confirmColor}
          onClick={handleConfirm}
          disabled={loading}
        >
          {loading ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
