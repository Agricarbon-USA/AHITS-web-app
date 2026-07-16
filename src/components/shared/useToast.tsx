'use client'

import * as React from 'react'
import { Snackbar, Alert } from '@mui/material'

interface ToastOptions {
  message: string
  severity?: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}

type ShowToast = (options: ToastOptions) => void

const ToastContext = React.createContext<ShowToast | null>(null)

export function ToastProvider({
  children,
  // CC-23: when the layout has a mobile bottom nav (operator shell), lift the
  // Snackbar above it so toasts aren't hidden behind the tab bar. Desktop (sm+,
  // no bottom nav) keeps the default 24px offset.
  bottomOffset = false,
}: {
  children: React.ReactNode
  bottomOffset?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [current, setCurrent] = React.useState<ToastOptions | null>(null)

  const showToast = React.useCallback<ShowToast>((options) => {
    setCurrent(options)
    setOpen(true)
  }, [])

  const handleClose = (_: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return
    setOpen(false)
  }

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={current?.duration ?? 4000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={bottomOffset ? { bottom: { xs: 'calc(80px + env(safe-area-inset-bottom, 0px))', sm: 24 } } : undefined}
      >
        <Alert
          onClose={handleClose}
          severity={current?.severity ?? 'success'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {current?.message ?? ''}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  )
}

export function useToast(): ShowToast {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
