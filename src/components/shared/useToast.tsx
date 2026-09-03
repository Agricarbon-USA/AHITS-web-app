'use client'

import * as React from 'react'
import { Snackbar, Alert, Button, IconButton, Stack } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'

interface ToastOptions {
  message: string
  severity?: 'success' | 'error' | 'warning' | 'info'
  duration?: number
  // UXP-6 (6a): optional inline action ("Sample bags added · Open"). Renders a
  // text button in the toast's action slot (44px target, so it is tappable on a
  // phone) and closes the toast when tapped. Existing calls are unchanged.
  action?: { label: string; onClick: () => void }
}

type ShowToast = (options: ToastOptions) => void

const ToastContext = React.createContext<ShowToast | null>(null)

// A toast with a button to tap deserves a beat longer on screen than a
// fire-and-forget one; callers still override via `duration`.
const DEFAULT_DURATION = 4000
const DEFAULT_DURATION_WITH_ACTION = 6000

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

  const action = current?.action
  const runAction = () => {
    setOpen(false)
    action?.onClick()
  }

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={current?.duration ?? (action ? DEFAULT_DURATION_WITH_ACTION : DEFAULT_DURATION)}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={bottomOffset ? { bottom: { xs: 'calc(80px + env(safe-area-inset-bottom, 0px))', sm: 24 } } : undefined}
      >
        <Alert
          // MUI renders EITHER `action` OR the `onClose` X — so with an action we
          // supply both controls ourselves; without one the original X stands.
          onClose={action ? undefined : handleClose}
          action={action ? (
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: -0.5 }}>
              <Button color="inherit" size="small" onClick={runAction} sx={{ minHeight: 44, minWidth: 44, fontWeight: 700 }}>
                {action.label}
              </Button>
              <IconButton aria-label="Close" color="inherit" size="small" onClick={handleClose} sx={{ width: 44, height: 44 }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          ) : undefined}
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
