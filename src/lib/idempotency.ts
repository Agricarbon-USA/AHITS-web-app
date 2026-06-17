import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Idempotent-write support for offline replay.
 *
 * The offline queue stamps every non-idempotent mutation (check-out, return,
 * transfer, end deployment, …) with an `Idempotency-Key`. If a write commits
 * on the server but its response is lost (the classic offline failure mode),
 * the queue replays it. Without dedup that produces duplicate deployments,
 * kit-items, CheckLogs and double-moved units. This wrapper records the
 * response for each key and returns the stored response on replay instead of
 * re-executing the handler.
 *
 * The store is a dedicated `idempotency_key` table accessed via raw SQL so it
 * needs no Prisma-client regeneration. Every DB call is best-effort: if the
 * table does not exist yet (i.e. the migration hasn't been applied), the
 * wrapper transparently degrades to normal execution — so a deploy that lands
 * ahead of `make db-migrate` still works, just without the dedup guarantee.
 */

export function getIdempotencyKey(req: Request): string | null {
  return req.headers.get('Idempotency-Key') ?? req.headers.get('idempotency-key')
}

async function getCached(key: string): Promise<{ status: number; body: unknown } | null> {
  try {
    const rows = await prisma.$queryRaw<{ status_code: number; response_body: unknown }[]>`
      SELECT status_code, response_body FROM idempotency_key WHERE key = ${key} LIMIT 1`
    if (!rows || rows.length === 0) return null
    return { status: rows[0].status_code, body: rows[0].response_body }
  } catch {
    return null // table missing pre-migration → behave as if no prior request
  }
}

async function save(key: string, scope: string, status: number, body: unknown): Promise<void> {
  try {
    const json = JSON.stringify(body ?? null)
    await prisma.$executeRaw`
      INSERT INTO idempotency_key (key, scope, status_code, response_body, created_at)
      VALUES (${key}, ${scope}, ${status}, ${json}::jsonb, NOW())
      ON CONFLICT (key) DO NOTHING`
  } catch {
    /* best-effort: never let dedup bookkeeping break the real request */
  }
}

/**
 * Wrap a route handler so repeated requests carrying the same Idempotency-Key
 * return the first response instead of re-running. Requests without a key (e.g.
 * normal desktop admin actions) pass straight through. Only sub-500 responses
 * are cached, so genuine server errors can still be retried.
 */
export async function withIdempotency(
  req: Request,
  scope: string,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const key = getIdempotencyKey(req)
  if (!key) return handler()

  const cached = await getCached(key)
  if (cached) {
    return NextResponse.json(cached.body as Record<string, unknown>, { status: cached.status })
  }

  const res = await handler()
  try {
    if (res.status < 500) {
      const body = await res.clone().json().catch(() => null)
      await save(key, scope, res.status, body)
    }
  } catch {
    /* ignore caching errors; the original response is unaffected */
  }
  return res
}
