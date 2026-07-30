'use client'

import * as React from 'react'
import { Snackbar, Button, IconButton } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'

/**
 * UR-008 / UXP-1b (records D31): the service worker uses skipWaiting + clientsClaim,
 * so a new build silently takes control of an open client — auto-apply on next launch
 * is the intended behavior and `sw.ts` is NOT touched by this file. This surfaces a
 * QUIET, dismissible "update available — Reload" prompt so the swap is visible and the
 * operator chooses when to refresh.
 *
 * Fixes the five defects the 2026-07-29 review found (A2/B-2/C3/E2/F-01, D-03):
 *  - no toast on the FIRST-EVER install (the bare `controllerchange` listener used to
 *    fire on the initial `clientsClaim`) — guarded by `hadController`;
 *  - the toast lifted above the operator tab bar (matches `useToast.tsx`'s offset) so
 *    it never covers the nav or eats a tab tap;
 *  - dismissible (X + `onClose`) and auto-hiding (~8s), re-offered when the tab next
 *    becomes visible if the update is still pending;
 *  - action color `inherit` (white on the #303030 snackbar = 13.1:1), fixing the
 *    2.43:1 amber-on-gray "Reload" contrast fail.
 */
export function ServiceWorkerUpdater() {
  const [show, setShow] = React.useState(false)
  // In-memory "an update is ready and unapplied" flag. NOT `reg.waiting`: under
  // skipWaiting+clientsClaim the new SW activates immediately, so `reg.waiting` is
  // null by the time `controllerchange` fires — keying the re-offer on it would be a
  // permanent no-op in the exact case that matters. A full Reload clears this (fresh
  // page state), which is correct: after reload there is nothing left to re-offer.
  const updateReadyRef = React.useRef(false)

  React.useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    // Hold the container in a local so the cleanup can't NPE if navigator.serviceWorker
    // is torn down (e.g. under a test stub) before the effect unmounts.
    const swContainer = navigator.serviceWorker

    const reveal = () => {
      updateReadyRef.current = true
      setShow(true)
    }

    // The first install claims the page via clientsClaim, firing `controllerchange`
    // with NO prior controller — that is not an "update", it's the SW coming online
    // for the first time, and must show nothing. Only a controllerchange when a
    // controller was ALREADY present is a real swap under an open client.
    const hadController = !!swContainer.controller
    const onControllerChange = () => { if (hadController) reveal() }
    swContainer.addEventListener('controllerchange', onControllerChange)

    // Proactively catch an update that installs while we're open (the non-clientsClaim
    // path). Both arms keep the existing `controller` guard so neither fires on first
    // install through this door either.
    swContainer.getRegistration().then((reg) => {
      if (!reg) return
      if (reg.waiting && swContainer.controller) reveal()
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing
        if (!nw) return
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && swContainer.controller) reveal()
        })
      })
    }).catch(() => { /* SW not registered yet — nothing to prompt */ })

    // Auto-hide dismisses the toast but leaves `updateReadyRef` set; re-offer the next
    // time the operator brings the tab forward so a still-unapplied update isn't lost
    // silently (D31: quiet, but not gone-for-good).
    const onVisible = () => {
      if (document.visibilityState === 'visible' && updateReadyRef.current) setShow(true)
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      swContainer.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const handleClose = (_?: unknown, reason?: string) => {
    if (reason === 'clickaway') return // an errant tap elsewhere must not dismiss it
    setShow(false)
  }

  return (
    <Snackbar
      open={show}
      autoHideDuration={8000}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      // UXP-1b: lift above the operator bottom nav exactly like useToast.tsx:47 so the
      // prompt never covers the tab bar or eats a tab tap. Desktop (sm+, no bottom nav)
      // keeps the default 24px offset.
      sx={{ bottom: { xs: 'calc(80px + env(safe-area-inset-bottom, 0px))', sm: 24 } }}
      message="A new version of AHITS is available."
      action={
        <>
          <Button color="inherit" size="small" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <IconButton
            aria-label="Dismiss update notice"
            color="inherit"
            size="small"
            onClick={() => handleClose()}
            sx={{ minWidth: 44, minHeight: 44 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </>
      }
    />
  )
}
