import { z } from 'zod'

/**
 * Shared validation primitives — single source of truth so the same rule is
 * not re-spelled (and allowed to drift) across routes.
 */

/** Operator PIN: exactly six digits. Use everywhere a PIN is accepted. */
export const PIN_REGEX = /^\d{6}$/
export const pinSchema = z.string().length(6).regex(PIN_REGEX, 'PIN must be 6 digits')

const TRIVIAL_PIN_DENYLIST = new Set(['123456', '654321', '121212', '112233', '123123', '696969'])

function isNonTrivialPin(pin: string): boolean {
  if (/^(.)\1{5}$/.test(pin)) return false
  const digits = pin.split('').map(Number)
  const ascending = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1)
  const descending = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1)
  if (ascending || descending) return false
  if (TRIVIAL_PIN_DENYLIST.has(pin)) return false
  return true
}

/** Use at PIN SET time only (change-pin, invite/complete) — not at login. */
export const newPinSchema = pinSchema.refine(isNonTrivialPin, 'Choose a less guessable PIN')

/**
 * Monetary amount. Stored as Postgres NUMERIC(10,2); validate at the API
 * boundary as a non-negative number with at most two decimal places so a
 * float like 19.999 is rejected rather than silently truncated. The 1e-9
 * tolerance absorbs IEEE-754 representation error (e.g. 19.99 * 100).
 */
export const money = () =>
  z
    .number()
    .nonnegative()
    .refine((n) => Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, {
      message: 'Must be a monetary value with at most 2 decimal places',
    })

/**
 * Parse and clamp list pagination from query params. Guards against NaN,
 * non-positive pages, and an unbounded `pageSize` — without a cap a client can
 * request `pageSize=1000000` and force a heavy, deep-include unbounded read
 * (DoS/latency). Use on EVERY paginated GET so the rule can't drift per route.
 * Returns a ready-to-spread `{ page, pageSize, skip }` for Prisma `skip`/`take`.
 */
export function parsePagination(
  searchParams: URLSearchParams,
  opts: { defaultSize?: number; maxSize?: number } = {},
): { page: number; pageSize: number; skip: number } {
  const { defaultSize = 25, maxSize = 100 } = opts
  const rawPage = Number.parseInt(searchParams.get('page') ?? '', 10)
  const rawSize = Number.parseInt(searchParams.get('pageSize') ?? '', 10)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
  const pageSize = Number.isFinite(rawSize) && rawSize > 0 ? Math.min(rawSize, maxSize) : defaultSize
  return { page, pageSize, skip: (page - 1) * pageSize }
}
