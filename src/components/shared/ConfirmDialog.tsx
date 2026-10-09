'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, CircularProgress,
} from '@mui/material'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  /** Optional lines under the message — e.g. what goes with a deleted item (PR-3c). */
  details?: React.ReactNode
  confirmLabel?: string
  confirmColor?: 'error' | 'warning' | 'primary'
  onClose: () => void
  onConfirm: () => Promise<void>
}

/**
 * Shared confirm dialog. Replaces the three near-identical local copies in the
 * admin pages. The `try/finally` guarantees the button can't get stuck on
 * "Working…" if the confirm action throws.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  details,
  confirmLabel = 'Confirm',
  confirmColor = 'primary',
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const [loading, setLoading] = React.useState(false)
  const handle = async () => {
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      setLoading(false)
    }
  }
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography>{message}</Typography>
        {details}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          color={confirmColor}
          onClick={handle}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {loading ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
