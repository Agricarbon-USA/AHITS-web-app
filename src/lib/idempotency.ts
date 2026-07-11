import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'

/**
 * Idempotent-write support for offline replay.
 *
 * The offline queue stamps every non-idempotent mutation with an
 * `Idempotency-Key`. On replay this wrapper returns the first response rather
 * than re-executing the handler, preventing duplicate deployments, kit-items,
 * CheckLogs, and double-moved units.
 *
 * Body binding (CR-2): the request body is hashed and bound to the key. A
 * replay of the same key carrying a DIFFERENT payload is a client/key-collision
 * bug, so it's rejected (422) rather than silently returning the first
 * response for an unrelated request.
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

function hashBody(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

interface CachedRow {
  status: number
  body: unknown
  bodyHash: string | null
}

async function getCached(key: string, scope: string): Promise<CachedRow | null> {
  try {
    const rows = await prisma.$queryRaw<{ status_code: number; response_body: unknown; body_hash: string | null }[]>`
      SELECT status_code, response_body, body_hash FROM idempotency_key
      WHERE key = ${key} AND scope = ${scope} AND status_code IS NOT NULL
      LIMIT 1`
    if (!rows || rows.length === 0) return null
    return { status: rows[0].status_code, body: rows[0].response_body, bodyHash: rows[0].body_hash }
  } catch {
    return null
  }
}

/** INSERT a placeholder (status_code NULL) to claim the key exclusively, binding the body hash. */
async function claimKey(key: string, scope: string, bodyHash: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ key: string }[]>`
      INSERT INTO idempotency_key (key, scope, status_code, body_hash, created_at)
      VALUES (${key}, ${scope}, NULL, ${bodyHash}, NOW())
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

const mismatchResponse = () =>
  NextResponse.json(
    { error: 'This Idempotency-Key was already used with a different request.' },
    { status: 422 },
  )

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

  // Hash the body off a clone so the original stream is still readable by the
  // handler (a request body can only be consumed once).
  let bodyHash = ''
  try {
    bodyHash = hashBody(await req.clone().text())
  } catch {
    bodyHash = ''
  }

  // Fast path: a committed response already exists for this key+scope.
  const cached = await getCached(key, scope)
  if (cached) {
    // CR-2: same key, different payload → reject rather than return the wrong
    // (first) response. Legacy rows with a null hash are treated as matching.
    if (cached.bodyHash && cached.bodyHash !== bodyHash) return mismatchResponse()
    return NextResponse.json(cached.body as Record<string, unknown>, { status: cached.status })
  }

  // Try to claim the key before running the handler.
  const claimed = await claimKey(key, scope, bodyHash)
  if (!claimed) {
    // Another request won the claim; poll with exponential backoff for its result.
    for (const delay of [50, 100, 200, 400, 800]) {
      await new Promise<void>((r) => setTimeout(r, delay))
      const retry = await getCached(key, scope)
      if (retry) {
        if (retry.bodyHash && retry.bodyHash !== bodyHash) return mismatchResponse()
        return NextResponse.json(retry.body as Record<string, unknown>, { status: retry.status })
      }
    }
    // Original still in-flight after ~1.55 s — tell the client to retry rather
    // than double-applying a slow write.
    return NextResponse.json(
      { error: 'Request in flight — retry after the original completes.' },
      { status: 409 },
    )
  }

  let res: NextResponse
  try {
    res = await handler()
  } catch (e) {
    await releaseKey(key)
    throw e
  }

  // Only cache responses that are DETERMINISTIC for a given (key, body):
  //   • 2xx  — the write succeeded; replays must return the same result.
  //   • 400  — schema/validation rejection; the same payload will always fail,
  //            so caching stops a doomed write from re-running forever.
  // Everything else is left retryable by releasing the placeholder. This is
  // critical for 409 (conflict): a transient conflict on replay (e.g. a unit
  // momentarily taken by a concurrent checkout) must NOT be frozen into a
  // permanent cached failure — once the conflict clears, the write can succeed.
  // 401/403 (auth) and 5xx (server) likewise must always be retryable.
  const cacheable = (res.status >= 200 && res.status < 300) || res.status === 400
  if (cacheable) {
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
