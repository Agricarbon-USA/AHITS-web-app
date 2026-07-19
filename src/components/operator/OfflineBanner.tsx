'use client'
import * as React from 'react'
import { Alert, Button, CircularProgress } from '@mui/material'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { BannerStack, BANNER_PRIORITY, type BannerDescriptor } from '@/components/ui/BannerStack'
import { OutboxDialog } from '@/components/operator/OutboxDialog'
import Link from 'next/link'

const bannerSx = { mb: 0, borderRadius: 0 } as const

export function OfflineBanner() {
  const {
    isOffline, pending, failed, syncing, sessionExpired,
    listAll, retryItem, discardFailed,
    idbWritable, possibleDataLoss, staleQueue, nearQuota, persistenceGranted,
  } = useOfflineQueue()
  const [mounted, setMounted] = React.useState(false)
  const [outboxOpen, setOutboxOpen] = React.useState(false)
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


  // CC-23: build the candidate banners with priorities, then collapse to the
  // single most-important one via BannerStack (was a Stack that rendered up to 7
  // at once). Ordered most-important-first within each tier so ties resolve
  // correctly. The data-risk errors (can't-save / possible-loss / failed sync)
  // are CRITICAL; offline/sync status is OFFLINE; the persistence notice is INFO.
  const banners: BannerDescriptor[] = []

  // CC-12 PR1: a flush parked on 401 with items still queued — prompt a re-login
  // instead of the queue reading "waiting to sync" forever. Pushed first so it
  // wins the CRITICAL (auth/parked-work) tier.
  if (sessionExpired && pending > 0) {
    banners.push({
      id: 'session-expired',
      priority: BANNER_PRIORITY.CRITICAL,
      node: (
        <Alert severity="warning" sx={bannerSx}
          action={<Button size="small" color="inherit" component={Link} href="/login">Sign in</Button>}>
          Session expired — sign in to send {pending} saved action{pending === 1 ? '' : 's'}.
        </Alert>
      ),
    })
  }

  if (showIdbError) {
    banners.push({
      id: 'idb-error',
      priority: BANNER_PRIORITY.CRITICAL,
      node: (
        <Alert severity="error" sx={bannerSx}>
          This device can&apos;t save offline actions — writes to local storage are
          blocked (Safari Private Mode or storage full). Actions you take offline will
          NOT be recorded.
        </Alert>
      ),
    })
  }
  if (showDataLoss) {
    banners.push({
      id: 'data-loss',
      priority: BANNER_PRIORITY.CRITICAL,
      node: (
        <Alert severity="error" sx={bannerSx}
          action={<Button size="small" color="inherit" onClick={() => setDismissedDataLoss(true)}>Dismiss</Button>}>
          Your device may have deleted queued offline actions since your last session.
          Check with your supervisor if any syncs are missing.
        </Alert>
      ),
    })
  }
  if (showFailedAlert) {
    banners.push({
      id: 'failed',
      priority: BANNER_PRIORITY.CRITICAL,
      node: (
        <Alert severity="error" sx={bannerSx}
          action={<Button size="small" color="inherit" onClick={() => setOutboxOpen(true)}>Review</Button>}>
          {failed} action(s) couldn&apos;t be applied. Open the Outbox to retry or discard each.
        </Alert>
      ),
    })
  }
  if (showStale) {
    banners.push({
      id: 'stale',
      priority: BANNER_PRIORITY.OFFLINE,
      node: (
        <Alert severity="warning" sx={bannerSx}
          action={<Button size="small" color="inherit" onClick={() => setDismissedStale(true)}>Dismiss</Button>}>
          You have offline actions queued for 6+ days. iOS may delete them soon —
          reconnect to sync.
        </Alert>
      ),
    })
  }
  if (showQuota) {
    banners.push({
      id: 'quota',
      priority: BANNER_PRIORITY.OFFLINE,
      node: (
        <Alert severity="warning" sx={bannerSx}
          action={<Button size="small" color="inherit" onClick={() => setDismissedQuota(true)}>Dismiss</Button>}>
          Device storage is nearly full. Free up space to avoid losing offline actions.
        </Alert>
      ),
    })
  }
  if (showQueueAlert) {
    banners.push({
      id: 'queue',
      priority: BANNER_PRIORITY.OFFLINE,
      node: (
        <Alert
          severity={isOffline ? 'warning' : 'info'}
          icon={syncing ? <CircularProgress size={16} /> : undefined}
          sx={bannerSx}
        >
          {isOffline
            ? `You're offline — showing cached data.${pending > 0 ? ` ${pending} action(s) queued.` : ''}`
            : syncing
              ? `Syncing ${pending} action(s)…`
              : `${pending} action(s) waiting to sync.`}
        </Alert>
      ),
    })
  }
  if (showPersistence) {
    banners.push({
      id: 'persistence',
      priority: BANNER_PRIORITY.INFO,
      node: (
        <Alert severity="info" sx={bannerSx}
          action={<Button size="small" color="inherit" onClick={() => setDismissedPersistence(true)}>Dismiss</Button>}>
          Offline storage is not guaranteed on this device — the OS may clear queued
          actions under storage pressure.
        </Alert>
      ),
    })
  }

  return (
    <>
      <BannerStack banners={banners} />
      <OutboxDialog
        open={outboxOpen}
        onClose={() => setOutboxOpen(false)}
        listAll={listAll}
        retryItem={retryItem}
        discardFailed={discardFailed}
        syncing={syncing}
      />
    </>
  )
}
