import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

/** Prisma "record to update/delete does not exist" (stale/guessed id). */
export function isRecordNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'
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
