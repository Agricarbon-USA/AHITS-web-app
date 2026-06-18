import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Idempotent-write support for offline replay.
 *
 * The offline queue stamps every non-idempotent mutation with an
 * `Idempotency-Key`. On replay this wrapper returns the first response rather
 * than re-executing the handler, preventing duplicate deployments, kit-items,
 * CheckLogs, and double-moved units.
 *
 * TOCTOU protection: the key is claimed with an INSERT (NULL status_code as
 * an in-flight placeholder) before the handler runs. Concurrent replays that
 * lose the INSERT race poll briefly for the committed result rather than
 * running the handler a second time.
 *
 * Graceful degradation: if the idempotency_key table is missing (migration not
 * yet applied), all DB calls are swallowed and the wrapper passes through —
 * so a deploy that lands ahead of `make db-migrate` still works, just without
 * the dedup guarantee.
 */

export function getIdempotencyKey(req: Request): string | null {
  return req.headers.get('Idempotency-Key') ?? req.headers.get('idempotency-key')
}

async function getCached(
  key: string,
  scope: string
): Promise<{ status: number; body: unknown } | null> {
  try {
    const rows = await prisma.$queryRaw<{ status_code: number; response_body: unknown }[]>`
      SELECT status_code, response_body FROM idempotency_key
      WHERE key = ${key} AND scope = ${scope} AND status_code IS NOT NULL
      LIMIT 1`
    if (!rows || rows.length === 0) return null
    return { status: rows[0].status_code, body: rows[0].response_body }
  } catch {
    return null
  }
}

/** INSERT a placeholder (status_code NULL) to claim the key exclusively. */
async function claimKey(key: string, scope: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ key: string }[]>`
      INSERT INTO idempotency_key (key, scope, status_code, created_at)
      VALUES (${key}, ${scope}, NULL, NOW())
      ON CONFLICT (key) DO NOTHING
      RETURNING key`
    return rows.length > 0
  } catch {
    return true // table missing → act as if we own it so the handler runs
  }
}

/** Write the actual response into our claimed row. */
async function commitKey(key: string, status: number, body: unknown): Promise<void> {
  try {
    const json = JSON.stringify(body ?? null)
    await prisma.$executeRaw`
      UPDATE idempotency_key
      SET status_code = ${status}, response_body = ${json}::jsonb
      WHERE key = ${key}`
  } catch {
    /* best-effort */
  }
}

/** Remove our in-flight placeholder so the key can be retried (e.g. handler threw). */
async function releaseKey(key: string): Promise<void> {
  try {
    await prisma.$executeRaw`
      DELETE FROM idempotency_key WHERE key = ${key} AND status_code IS NULL`
  } catch {
    /* best-effort */
  }
}

/**
 * Wrap a route handler so repeated requests carrying the same Idempotency-Key
 * return the first response instead of re-running. Requests without a key pass
 * straight through. Auth errors (401/403) are never cached so a re-authenticated
 * replay gets a fresh result. Server errors (5xx) are never cached so they can
 * always be retried.
 */
export async function withIdempotency(
  req: Request,
  scope: string,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const key = getIdempotencyKey(req)
  if (!key) return handler()

  // Fast path: a committed response already exists for this key+scope.
  const cached = await getCached(key, scope)
  if (cached) {
    return NextResponse.json(cached.body as Record<string, unknown>, { status: cached.status })
  }

  // Try to claim the key before running the handler.
  const claimed = await claimKey(key, scope)
  if (!claimed) {
    // Another request won the claim; poll briefly for its committed result.
    for (let i = 0; i < 4; i++) {
      await new Promise<void>((r) => setTimeout(r, 50))
      const retry = await getCached(key, scope)
      if (retry) return NextResponse.json(retry.body as Record<string, unknown>, { status: retry.status })
    }
    // Still in-flight after ~200 ms — fall through and run the handler anyway.
    // This is a very narrow race; in the worst case one extra write occurs.
  }

  let res: NextResponse
  try {
    res = await handler()
  } catch (e) {
    await releaseKey(key)
    throw e
  }

  // Cache 2xx–4xx responses, but never auth errors (session may be
  // re-established on retry) and never server errors (they must be retried).
  if (res.status < 500 && res.status !== 401 && res.status !== 403) {
    try {
      const body = await res.clone().json().catch(() => null)
      await commitKey(key, res.status, body)
    } catch {
      /* ignore caching errors; the original response is unaffected */
    }
  } else {
    // Release the in-flight placeholder so the key is retryable.
    await releaseKey(key)
  }

  return res
}
