// CC-15 (D2): Deployment Map read-side helpers.
//
// Anti-goal guard (DECISIONS.md D2): everything here is derived from GPS captured on
// daily-check ATTESTATIONS. There is NO live position — a pin/trail is "where a rig has
// been," assembled from checks the operator already submits. No polling, no watchPosition,
// no "current location". Keep this module's language historical.

import { color } from '@/theme/tokens'

export type RecencyBucket = 'fresh' | 'aging' | 'stale'

/** Whole-day difference (b − a) between two `YYYY-MM-DD` business-date strings. */
export function businessDayDiff(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`)
  const db = Date.parse(`${b}T00:00:00Z`)
  if (Number.isNaN(da) || Number.isNaN(db)) return 0
  return Math.round((db - da) / 86_400_000)
}

/**
 * Recency of a rig's latest GPS-bearing check — the pin's colour. businessDate-aware
 * (FND-7): both inputs are `YYYY-MM-DD` business dates, so an evening check is bucketed
 * by its business day, never mis-coloured by the UTC skew. The hour thresholds in the
 * spec (green <24h / amber 24–48h / red >48h) map to whole business days:
 *   fresh (green) = checked today (0 days) ·
 *   aging (amber) = checked yesterday (1 day) ·
 *   stale (red)   = 2+ business days ago.
 * A check dated in the future (clock skew on a queued replay) buckets fresh, not stale.
 */
export function recencyBucket(checkBusinessDate: string, todayBusinessDate: string): RecencyBucket {
  const diff = businessDayDiff(checkBusinessDate, todayBusinessDate)
  if (diff <= 0) return 'fresh'
  if (diff === 1) return 'aging'
  return 'stale'
}

// Pin colours per bucket, sourced from the design tokens (not raw hex) so the map matches
// the rest of the app; these literal values are handed to Mapbox GL marker elements, which
// live outside the MUI theme context.
export const RECENCY_COLOR: Record<RecencyBucket, string> = {
  fresh: color.brand, // green  — checked today (<24h business)
  aging: color.amber, // amber  — checked yesterday (24–48h business)
  stale: color.error, // red    — 2+ business days stale (>48h)
}

export const RECENCY_LABEL: Record<RecencyBucket, string> = {
  fresh: 'Checked today',
  aging: 'Checked yesterday',
  stale: '2+ days since last check',
}

/** Recover the stored business-date string from a Prisma `@db.Date` value (UTC midnight). */
export function dbDateToBusinessDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ── Shared, serializable domain shapes (pure — safe to import from client views) ──

/** One pin per active deployment, at its latest GPS-bearing check. */
export interface RigPosition {
  rigId: string
  operatorId: string | null
  operatorName: string | null
  vehicleName: string | null
  lng: number
  lat: number
  /** Business date of the check the pin sits on (YYYY-MM-DD). */
  checkBusinessDate: string
  bucket: RecencyBucket
}

/** An operator's last-known position, for crew coordination (never live). */
export interface CrewPosition {
  operatorId: string
  operatorName: string | null
  vehicleName: string | null
  lng: number
  lat: number
  checkBusinessDate: string
  bucket: RecencyBucket
}

/** One historical point on a rig's route trail. */
export interface TrailPoint {
  lng: number
  lat: number
  businessDate: string
}
