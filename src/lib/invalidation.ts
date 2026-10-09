// PR-5 (U-9/U-10): one window event says "this kind of record changed — re-read it".
// A mutation names the entity keys it changes (`invalidates`); every list, page
// load and SWR read subscribes to the keys it shows (`useInvalidation`). The same
// event fires when an action succeeds online (`useMutation`) and when the offline
// queue applies a queued item on drain (`useOfflineQueue` flush), so a screen
// reconciles without a reload either way.
//
// Generalises UXP-3's INCOMING_PENDING_CHANGED (one key, one listener) to every
// entity. A plain DOM event, no provider: a page with nothing subscribed just
// dispatches to nobody. Pure — no React — so the queue hook can import it.

export const ENTITY_KEYS = [
  'inventory',
  'vehicles',
  'deployments',
  'maintenance',
  'requests',
  'transfers',
  'alerts',
  'notifications',
  'today',
  'hubs',
] as const

export type EntityKey = (typeof ENTITY_KEYS)[number]

export const INVALIDATE_EVENT = 'ahits:invalidate'

export interface InvalidateDetail {
  keys: EntityKey[]
}

export function isEntityKey(v: unknown): v is EntityKey {
  return typeof v === 'string' && (ENTITY_KEYS as readonly string[]).includes(v)
}

/** Tell every mounted subscriber that these entities changed. No-op on the server. */
export function dispatchInvalidate(keys: readonly EntityKey[]): void {
  if (typeof window === 'undefined' || keys.length === 0) return
  const detail: InvalidateDetail = { keys: [...new Set(keys)] }
  window.dispatchEvent(new CustomEvent<InvalidateDetail>(INVALIDATE_EVENT, { detail }))
}

// What a read endpoint shows, by path prefix — so `useListQuery` and `useFreshList`
// subscribe without every caller naming its keys. Longest prefix wins.
const ENDPOINT_KEYS: [prefix: string, keys: EntityKey[]][] = [
  ['/api/operator/today', ['today', 'deployments', 'transfers', 'requests']],
  ['/api/deployment-requests', ['requests']],
  ['/api/deployments', ['deployments']],
  ['/api/inventory', ['inventory']],
  ['/api/vehicles', ['vehicles']],
  ['/api/maintenance', ['maintenance']],
  ['/api/transfers', ['transfers']],
  ['/api/handoffs', ['transfers']],
  ['/api/admin/alerts', ['alerts']],
  ['/api/notifications', ['notifications']],
  ['/api/hubs', ['hubs']],
  ['/api/dashboard', ['alerts', 'deployments', 'vehicles', 'inventory', 'maintenance']],
]

/** The keys a read of `url` should refresh on. Unknown endpoints subscribe to nothing. */
export function keysForEndpoint(url: string): EntityKey[] {
  const path = url.split('?')[0]
  let best: [string, EntityKey[]] | null = null
  for (const entry of ENDPOINT_KEYS) {
    const [prefix] = entry
    if ((path === prefix || path.startsWith(prefix + '/')) && (!best || prefix.length > best[0].length)) best = entry
  }
  return best ? [...best[1]] : []
}
