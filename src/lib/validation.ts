import { z } from 'zod'

/**
 * Shared validation primitives — single source of truth so the same rule is
 * not re-spelled (and allowed to drift) across routes.
 */

/** Operator PIN: exactly six digits. Use everywhere a PIN is accepted. */
export const PIN_REGEX = /^\d{6}$/
export const pinSchema = z.string().length(6).regex(PIN_REGEX, 'PIN must be 6 digits')

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
