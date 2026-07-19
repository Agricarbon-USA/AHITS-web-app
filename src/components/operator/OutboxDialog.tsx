'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, IconButton, Typography, Stack,
  Button, Divider, Box, CircularProgress,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { StatusChip } from '@/components/shared/StatusChip'
import type { OfflineQueueItem } from '@/types'

interface OutboxDialogProps {
  open: boolean
  onClose: () => void
  // Passed from the owner's single useOfflineQueue instance (no redundant hook).
  listAll: () => Promise<OfflineQueueItem[]>
  retryItem: (id: number) => Promise<void>
  discardFailed: (id: number) => Promise<void>
  syncing: boolean
}

// CC-12 PR1: the OUTBOX — the honest, per-item view of the offline queue. Shows
// each queued action's label + (for failed items) its lastError, with per-item
// Retry / Discard. Replaces the old blind bulk "Dismiss all failed" so an
// operator can re-send or drop ONE action instead of nuking the whole batch.
export function OutboxDialog({ open, onClose, listAll, retryItem, discardFailed, syncing }: OutboxDialogProps) {
  const [items, setItems] = React.useState<OfflineQueueItem[]>([])
  const [busyId, setBusyId] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    setItems(await listAll())
  }, [listAll])

  React.useEffect(() => {
    if (open) void load()
  }, [open, load])

  const onRetry = async (id: number) => {
    setBusyId(id)
    try {
      await retryItem(id)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const onDiscard = async (id: number) => {
    setBusyId(id)
    try {
      await discardFailed(id)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
        Outbox
        <IconButton aria-label="Close" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            Nothing queued — everything has synced.
          </Typography>
        ) : (
          <Stack divider={<Divider />} spacing={0}>
            {items.map((item) => {
              const failed = item.status === 'failed'
              const id = item.id
              return (
                <Box key={id ?? `${item.endpoint}-${item.createdAt}`} sx={{ py: 1.25 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                    <Typography variant="body2" sx={{ minWidth: 0, wordBreak: 'break-word' }}>
                      {item.label ?? `${item.method} ${item.endpoint}`}
                    </Typography>
                    <StatusChip
                      label={failed ? 'Failed' : syncing ? 'Sending' : 'Waiting'}
                      color={failed ? 'error' : syncing ? 'info' : 'default'}
                    />
                  </Stack>
                  {failed && item.lastError && (
                    <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                      {item.lastError}
                    </Typography>
                  )}
                  {failed && id != null && (
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Button size="small" variant="outlined" disabled={busyId === id}
                        startIcon={busyId === id ? <CircularProgress size={14} /> : undefined}
                        onClick={() => onRetry(id)}>
                        Retry
                      </Button>
                      <Button size="small" color="error" disabled={busyId === id} onClick={() => onDiscard(id)}>
                        Discard
                      </Button>
                    </Stack>
                  )}
                </Box>
              )
            })}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  )
}
