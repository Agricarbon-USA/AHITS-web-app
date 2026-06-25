// ─────────────────────────────────────────────────────────────────────────
// Shared-store fixed-window rate limiter (CR-3 / CR-4).
//
// State lives in Postgres (`rate_limit_hit`), so the per-IP ceiling holds
// across ALL Cloud Run instances — closing the per-instance leak of the old
// in-memory limiter. Each window is its own row, keyed by
// "<scope:ip>|<windowStartEpochMs>"; the post-increment count is returned by an
// atomic INSERT … ON CONFLICT DO UPDATE. Expired rows are reaped
// opportunistically.
//
// If the database is unreachable the limiter FALLS BACK to a per-instance
// in-memory window (fail-soft): a DB blip must not lock every user out, and the
// per-account lockout in lib/auth/pin.ts remains the primary per-credential
// defense regardless. This limiter guards against high-volume scripted attacks
// (e.g. spraying many accounts from one IP, or hammering the public /s/ links).
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma'

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

// ── In-memory fallback (only used when the DB call throws) ──────────────────
type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

function memoryRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
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

/**
 * Record one hit against `key` and report whether it is allowed.
 * Backed by Postgres so the window is shared across instances; falls back to a
 * per-instance in-memory window if the DB is unreachable.
 *
 * @param limit    max hits permitted per window
 * @param windowMs window length in milliseconds
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs
  const resetAt = windowStart + windowMs
  const bucketKey = `${key}|${windowStart}`

  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "rate_limit_hit" ("bucket_key", "count", "reset_at")
      VALUES (${bucketKey}, 1, ${new Date(resetAt)})
      ON CONFLICT ("bucket_key")
      DO UPDATE SET "count" = "rate_limit_hit"."count" + 1
      RETURNING "count"
    `
    const count = Number(rows[0]?.count ?? 1)

    // Reap expired rows ~1% of the time to bound table growth without a cron.
    if (Math.random() < 0.01) {
      void prisma.$executeRaw`DELETE FROM "rate_limit_hit" WHERE "reset_at" < ${new Date(now)}`.catch(() => {})
    }

    const allowed = count <= limit
    return {
      allowed,
      remaining: Math.max(0, limit - count),
      retryAfterSec: allowed ? 0 : Math.ceil((resetAt - now) / 1000),
    }
  } catch {
    // DB unavailable → fail soft to the per-instance limiter.
    return memoryRateLimit(key, limit, windowMs)
  }
}

/**
 * Extract the client IP from forwarding headers.
 *
 * `X-Forwarded-For` is a comma-separated chain; each hop appends the address it
 * received the request FROM, so the rightmost entries are added by infra you
 * control. The trustworthy client IP is therefore the Nth-from-the-right, where
 * N is the number of trusted proxy hops between this app and the open internet.
 *
 *   • Direct Cloud Run (run.app)            → 1 hop  (default): the real peer is
 *                                             the last XFF entry.
 *   • Behind one Google external HTTPS LB   → set RATE_LIMIT_TRUSTED_HOPS=2:
 *                                             the LB's address is last, the
 *                                             client is second-from-last.
 *
 * Pinning to a fixed position (rather than blindly taking the last entry)
 * prevents a client from spoofing its bucket by injecting extra XFF values.
 */
export function clientIp(req: Request): string {
  const hops = Math.max(1, Math.trunc(Number(process.env.RATE_LIMIT_TRUSTED_HOPS ?? '1')) || 1)
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length > 0) {
      const idx = Math.max(0, parts.length - hops)
      return parts[idx] || 'unknown'
    }
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}
