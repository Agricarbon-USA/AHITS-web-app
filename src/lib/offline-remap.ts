// M1-9: dependent-write id-remapping for offline replay.
//
// When an operator creates a resource offline (e.g. a deployment) it has no
// server id yet, so it is queued under a client-generated PLACEHOLDER id like
// "pending-<uuid>". Any dependent writes taken before reconnect (e.g. adding
// items to that deployment) encode the placeholder in their endpoint/body.
//
// On reconnect the create replays first and the server returns the real id.
// These helpers rewrite the placeholder → real id in every later queued item so
// the dependent writes target the real resource instead of a dead "pending-…"
// path. Kept as pure functions so the logic is unit-testable without IndexedDB.

import type { OfflineQueueItem } from '@/types'

const PLACEHOLDER_PREFIX = 'pending-'

/** Generate a client-side placeholder id for a not-yet-synced create. */
export function newPlaceholderId(): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  return `${PLACEHOLDER_PREFIX}${rand}`
}

/** True if a value looks like a client-generated placeholder id. */
export function isPlaceholderId(value: string): boolean {
  return value.startsWith(PLACEHOLDER_PREFIX)
}

/** Pull a server-assigned id out of a create response ({id} or {data:{id}}). */
export function extractCreatedId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (typeof b.id === 'string' && b.id) return b.id
  const data = b.data as Record<string, unknown> | undefined
  if (data && typeof data.id === 'string' && data.id) return data.id
  return null
}

/** True if the item references `placeholderId` in its endpoint or body. */
export function itemReferencesPlaceholder(item: OfflineQueueItem, placeholderId: string): boolean {
  if (!placeholderId) return false
  if (item.endpoint.includes(placeholderId)) return true
  if (item.body == null) return false
  try {
    return JSON.stringify(item.body).includes(placeholderId)
  } catch {
    return false
  }
}

/**
 * Replace every occurrence of `placeholderId` with `realId` in the item's
 * endpoint and (JSON-encoded) body. Returns the same reference unchanged when
 * the placeholder is absent, so callers can skip a needless persist.
 */
export function remapPlaceholderId(
  item: OfflineQueueItem,
  placeholderId: string,
  realId: string,
): OfflineQueueItem {
  if (!placeholderId || !itemReferencesPlaceholder(item, placeholderId)) return item
  const endpoint = item.endpoint.split(placeholderId).join(realId)
  let body = item.body
  if (body != null) {
    try {
      const json = JSON.stringify(body)
      if (json.includes(placeholderId)) {
        body = JSON.parse(json.split(placeholderId).join(realId))
      }
    } catch {
      /* non-serializable body — leave as-is (endpoint remap still applied) */
    }
  }
  return { ...item, endpoint, body }
}
