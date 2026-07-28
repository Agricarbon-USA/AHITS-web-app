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
 * CC-29 item 7b: a `photoUrls` array that REJECTS unresolved `localphoto:` refs. The
 * offline queue must upload each photo and swap its `localphoto:<uuid>` ref for a real
 * URL before a write is sent (photoStore.resolvePhotoRefs). A body that still carries a
 * local ref means the client sent prematurely — reject it so the queue SURFACES the
 * failure instead of the route persisting a dead ref that renders as a broken image.
 * `filterAllowedPhotoUrls` (photo-security.ts) already drops these at Photo-row creation;
 * this closes the raw-array persistence path (the transfer row, and any future route).
 * The prefix is LOCAL_PHOTO_PREFIX from photoStore — hardcoded here to keep this
 * server-side module free of the client photo store.
 */
export const PHOTO_NOT_UPLOADED_MSG = 'Photo not yet uploaded — retry when online'

export const photoUrlsField = () =>
  z.array(z.string().refine((u) => !u.startsWith('localphoto:'), PHOTO_NOT_UPLOADED_MSG)).default([])

/**
 * True when a failed parse is (at least partly) an unresolved-localphoto rejection.
 * The route answers 422 for it rather than a generic 400 — deliberately: withIdempotency
 * caches 400 responses but NOT 422, so a corrected re-send (same Idempotency-Key, now
 * carrying real URLs) is a fresh attempt instead of a frozen/mismatched cached failure.
 */
export function isPhotoNotUploadedError(err: z.ZodError): boolean {
  return err.issues.some((i) => i.message === PHOTO_NOT_UPLOADED_MSG)
}

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
