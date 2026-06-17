'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography,
} from '@mui/material'

interface NotePhotoDialogProps {
  open: boolean
  title: string
  description?: string
  loading?: boolean
  onClose: () => void
  onConfirm: (note: string, photoUrls: string[]) => void
  confirmLabel?: string
  confirmColor?: 'primary' | 'error' | 'warning' | 'success' | 'inherit'
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
}: NotePhotoDialogProps) {
  const [note, setNote] = React.useState('')

  function handleConfirm() {
    onConfirm(note, [])
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
        <TextField
          label="Note"
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
