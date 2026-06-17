// ─────────────────────────────────────────────────────────────────────────
// Lightweight in-memory fixed-window rate limiter.
//
// This is a best-effort FIRST layer of brute-force protection. State lives in
// process memory, so on a multi-instance Cloud Run deployment each instance
// keeps its own counters — an attacker spread across instances gets a higher
// effective ceiling. For production-grade protection this should be backed by
// a shared store (Postgres table or Upstash/Redis). Tracked as a follow-up.
//
// The per-account lockout in lib/auth/pin.ts remains the primary defense
// against guessing a single account's credential; this limiter guards against
// high-volume scripted attacks (e.g. spraying many accounts from one IP).
// ─────────────────────────────────────────────────────────────────────────

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

/**
 * Record one hit against `key` and report whether it is allowed.
 * @param limit    max hits permitted per window
 * @param windowMs window length in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()

  // Opportunistically prune expired buckets to bound memory growth.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k)
  }

  const existing = buckets.get(key)
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 }
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) }
  }

  existing.count += 1
  return { allowed: true, remaining: limit - existing.count, retryAfterSec: 0 }
}

/** Best-effort extraction of the client IP from forwarding headers (Cloud Run sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim() || 'unknown'
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}
