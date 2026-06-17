'use client'
import { Alert } from '@mui/material'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'

export function OfflineBanner() {
  const { isOffline, queueSize } = useOfflineQueue()
  if (!isOffline && queueSize === 0) return null
  return (
    <Alert severity={isOffline ? 'warning' : 'info'} sx={{ mb: 0, borderRadius: 0 }}>
      {isOffline
        ? `You're offline. My Rig is showing cached data.${queueSize > 0 ? ` ${queueSize} item(s) pending sync.` : ''}`
        : `${queueSize} action(s) waiting to sync — go online to complete.`}
    </Alert>
  )
}
