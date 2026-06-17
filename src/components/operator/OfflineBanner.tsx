'use client'
import { Alert, CircularProgress, Stack } from '@mui/material'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'

export function OfflineBanner() {
  const { isOffline, pending, failed, syncing } = useOfflineQueue()

  // Nothing to report: online, synced, no failures, not syncing.
  if (!isOffline && pending === 0 && failed === 0 && !syncing) return null

  return (
    <Stack>
      {failed > 0 && (
        <Alert severity="error" sx={{ mb: 0, borderRadius: 0 }}>
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
