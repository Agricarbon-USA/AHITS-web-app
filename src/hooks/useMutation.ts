'use client'

import * as React from 'react'
import type { MutateResult, OfflineQueueItem } from '@/types'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { useToast } from '@/components/shared/useToast'
import { apiErrorMessage } from '@/lib/api-error-shape'
import { dispatchInvalidate, type EntityKey } from '@/lib/invalidation'

// PR-5 (U-9/U-10/U-12): the one way a screen changes something. Wraps the offline
// queue's mutate() (network first; durable, idempotent queue on a network failure)
// and adds the reconcile half:
//   - success online → dispatch `invalidates`, so every open list/page showing
//     those entities re-reads (useInvalidation);
//   - queued → the keys ride on the queue item; flush() dispatches them when the
//     item is applied, so the screen reconciles after the drain without a reload;
//   - failure → a toast through apiErrorMessage with an explicit error severity
//     (never a zod object, never a green toast for a failure).
// `success`/`queued` toasts are opt-in per call; pass `toast: false` to own them.

export interface RunArgs<T> {
  endpoint: string
  method?: OfflineQueueItem['method']
  body?: unknown
  /** Shown in the outbox while queued. */
  label?: string
  /** Entity keys this write changes. Required: a write that changes nothing visible names []. */
  invalidates: EntityKey[]
  placeholderId?: string
  /** Success toast (online). A function receives the response body. */
  success?: string | ((data: T) => string)
  /** Toast when the write was queued offline. Default: "<label> queued — will sync when online." */
  queued?: string
  /** Error toast when the server's body carries no message. */
  errorFallback?: string
  /** false → no toasts at all; the caller reads the result. */
  toast?: boolean
}

export function useMutation() {
  const { mutate } = useOfflineQueue()
  const showToast = useToast()
  const [running, setRunning] = React.useState(0)

  const run = React.useCallback(
    async <T = unknown>(args: RunArgs<T>): Promise<MutateResult<T>> => {
      const { invalidates, success, queued, errorFallback, toast = true, ...req } = args
      setRunning((n) => n + 1)
      try {
        const result = await mutate<T>({ ...req, invalidates })
        if (result.ok && !result.queued) {
          dispatchInvalidate(invalidates)
          if (toast && success) {
            showToast({ message: typeof success === 'function' ? success(result.data) : success, severity: 'success' })
          }
        } else if (result.ok && result.queued) {
          if (toast) {
            showToast({ message: queued ?? `${req.label ?? 'Change'} queued — will sync when online.`, severity: 'info' })
          }
        } else if (toast) {
          showToast({
            message: apiErrorMessage({ error: result.error }, errorFallback ?? 'Something went wrong. Please try again.'),
            severity: 'error',
          })
        }
        return result
      } finally {
        setRunning((n) => n - 1)
      }
    },
    [mutate, showToast],
  )

  return { run, running: running > 0 }
}
