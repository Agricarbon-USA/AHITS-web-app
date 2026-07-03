'use client'
import * as React from 'react'
import { Alert, Button, CircularProgress, Stack } from '@mui/material'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'

export function OfflineBanner() {
  const {
    isOffline, pending, failed, syncing, listFailed, discardFailed,
    idbWritable, possibleDataLoss, staleQueue, nearQuota, persistenceGranted,
  } = useOfflineQueue()
  const [mounted, setMounted] = React.useState(false)
  const [dismissedDataLoss, setDismissedDataLoss] = React.useState(false)
  const [dismissedStale, setDismissedStale] = React.useState(false)
  const [dismissedQuota, setDismissedQuota] = React.useState(false)
  const [dismissedPersistence, setDismissedPersistence] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  // Server and initial client render must match — return null until mounted to
  // avoid #418 from the isOffline state initializer diverging when offline.
  if (!mounted) return null

  const showIdbError = !idbWritable
  const showDataLoss = possibleDataLoss && !dismissedDataLoss
  const showStale = staleQueue && !dismissedStale
  const showQuota = nearQuota && !dismissedQuota
  const showPersistence = persistenceGranted === false && !dismissedPersistence
  const showQueueAlert = isOffline || pending > 0 || syncing
  const showFailedAlert = failed > 0

  if (
    !showIdbError && !showDataLoss && !showStale && !showQuota &&
    !showPersistence && !showQueueAlert && !showFailedAlert
  ) return null

  const dismissFailed = async () => {
    const items = await listFailed()
    await Promise.all(items.map((i) => i.id != null ? discardFailed(i.id) : Promise.resolve()))
  }

  return (
    <Stack>
      {showIdbError && (
        <Alert severity="error" sx={{ mb: 0, borderRadius: 0 }}>
          This device can&apos;t save offline actions — writes to local storage are
          blocked (Safari Private Mode or storage full). Actions you take offline will
          NOT be recorded.
        </Alert>
      )}
      {showDataLoss && (
        <Alert
          severity="error"
          sx={{ mb: 0, borderRadius: 0 }}
          action={
            <Button size="small" color="inherit" onClick={() => setDismissedDataLoss(true)}>
              Dismiss
            </Button>
          }
        >
          Your device may have deleted queued offline actions since your last session.
          Check with your supervisor if any syncs are missing.
        </Alert>
      )}
      {showFailedAlert && (
        <Alert
          severity="error"
          sx={{ mb: 0, borderRadius: 0 }}
          action={
            <Button size="small" color="inherit" onClick={dismissFailed}>
              Dismiss
            </Button>
          }
        >
          {failed} action(s) couldn&apos;t be applied — they changed on the server or were
          rejected. Re-scan to try again.
        </Alert>
      )}
      {showStale && (
        <Alert
          severity="warning"
          sx={{ mb: 0, borderRadius: 0 }}
          action={
            <Button size="small" color="inherit" onClick={() => setDismissedStale(true)}>
              Dismiss
            </Button>
          }
        >
          You have offline actions queued for 6+ days. iOS may delete them soon —
          reconnect to sync.
        </Alert>
      )}
      {showQuota && (
        <Alert
          severity="warning"
          sx={{ mb: 0, borderRadius: 0 }}
          action={
            <Button size="small" color="inherit" onClick={() => setDismissedQuota(true)}>
              Dismiss
            </Button>
          }
        >
          Device storage is nearly full. Free up space to avoid losing offline actions.
        </Alert>
      )}
      {showPersistence && (
        <Alert
          severity="info"
          sx={{ mb: 0, borderRadius: 0 }}
          action={
            <Button size="small" color="inherit" onClick={() => setDismissedPersistence(true)}>
              Dismiss
            </Button>
          }
        >
          Offline storage is not guaranteed on this device — the OS may clear queued
          actions under storage pressure.
        </Alert>
      )}
      {showQueueAlert && (
        <Alert
          severity={isOffline ? 'warning' : 'info'}
          icon={syncing ? <CircularProgress size={16} /> : undefined}
          sx={{ mb: 0, borderRadius: 0 }}
        >
          {isOffline
            ? `You're offline — showing cached data.${pending > 0 ? ` ${pending} action(s) queued.` : ''}`
            : syncing
              ? `Syncing ${pending} action(s)…`
              : `${pending} action(s) waiting to sync.`}
        </Alert>
      )}
    </Stack>
  )
}
