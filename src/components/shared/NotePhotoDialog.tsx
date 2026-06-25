'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography,
} from '@mui/material'
import { PhotoCapture } from './PhotoCapture'

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
  const [photos, setPhotos] = React.useState<string[]>([])

  function handleConfirm() {
    onConfirm(note, photos)
    setNote('')
    setPhotos([])
  }

  function handleClose() {
    setNote('')
    setPhotos([])
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
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, mb: 0.5 }}>
          Photos (optional)
        </Typography>
        <PhotoCapture value={photos} onChange={setPhotos} disabled={loading} />
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
