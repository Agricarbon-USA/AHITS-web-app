'use client'

import * as React from 'react'
import { Snackbar, Button } from '@mui/material'

/**
 * UR-008: the service worker uses skipWaiting + clientsClaim, so a new build can
 * take control of an open client silently — swapping chunks under an operator
 * mid-form. This surfaces a non-blocking "update available — Reload" prompt so the
 * swap is visible and the operator chooses when to refresh, rather than being
 * caught by a silent controller change.
 */
export function ServiceWorkerUpdater() {
  const [show, setShow] = React.useState(false)

  React.useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    const reveal = () => setShow(true)

    // A new SW activated and claimed this client (skipWaiting). Offer a reload
    // instead of hard-reloading mid-task.
    navigator.serviceWorker.addEventListener('controllerchange', reveal)

    // Proactively catch an update that has installed while we're open.
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return
      if (reg.waiting && navigator.serviceWorker.controller) reveal()
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing
        if (!nw) return
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) reveal()
        })
      })
    }).catch(() => { /* SW not registered yet — nothing to prompt */ })

    return () => navigator.serviceWorker.removeEventListener('controllerchange', reveal)
  }, [])

  return (
    <Snackbar
      open={show}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      message="A new version of AHITS is available."
      action={
        <Button color="secondary" size="small" onClick={() => window.location.reload()}>
          Reload
        </Button>
      }
    />
  )
}
