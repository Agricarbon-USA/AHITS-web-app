import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

/** Prisma "record to update/delete does not exist" (stale/guessed id). */
export function isRecordNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'
}

/** Prisma unique-constraint violation (e.g. duplicate email). */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

/**
 * Unique-constraint violation from either an ORM call (P2002) or a raw
 * `$executeRaw`/`$queryRaw` call. Prisma wraps a raw-query constraint failure as
 * P2010 ("Raw query failed") with the real Postgres SQLSTATE nested at
 * `err.meta.code` instead of top-level `err.code` — a plain `err.code === '23505'`
 * check never matches a raw insert (e.g. `ensureOpenAssignment`'s `$executeRaw`),
 * so callers guarding a partial-unique-index race on a raw write must use this
 * instead of `isUniqueViolation`.
 */
export function isUniqueViolationAnywhere(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (err.code === 'P2002') return true
  if (err.code === 'P2010') {
    const meta = err.meta as { code?: string } | undefined
    return meta?.code === '23505'
  }
  return false
}

/**
 * Run a Prisma write whose target row may not exist — a soft-delete `update` or a
 * `delete` keyed on a client-supplied id. On P2025 ("record not found") it returns
 * a clean 404 JSON instead of letting Prisma throw an unhandled, non-JSON 500
 * (e.g. a row already deleted in another tab). Any other error is re-thrown for the
 * caller's existing handling.
 *
 * Returns the 404 `NextResponse` on a missing row, or `null` on success, so callers
 * stay flat:
 *
 *   const notFound = await writeOr404(() => prisma.x.update({ where: { id }, data }))
 *   if (notFound) return notFound
 *   return NextResponse.json({ ok: true })
 */
export async function writeOr404(
  fn: () => Promise<unknown>,
  message = 'Not found',
): Promise<NextResponse | null> {
  try {
    await fn()
    return null
  } catch (err) {
    if (isRecordNotFound(err)) {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    throw err
  }
}
