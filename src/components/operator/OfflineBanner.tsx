'use client'
import * as React from 'react'
import { Alert, Button, CircularProgress, Stack } from '@mui/material'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'

export function OfflineBanner() {
  const { isOffline, pending, failed, syncing, listFailed, discardFailed } = useOfflineQueue()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  // Server and initial client render must match — return null until mounted to
  // avoid #418 from the isOffline state initializer diverging when offline.
  if (!mounted) return null
  if (!isOffline && pending === 0 && failed === 0 && !syncing) return null

  const dismissFailed = async () => {
    const items = await listFailed()
    await Promise.all(items.map((i) => i.id != null ? discardFailed(i.id) : Promise.resolve()))
  }

  return (
    <Stack>
      {failed > 0 && (
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
      {(isOffline || pending > 0 || syncing) && (
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
