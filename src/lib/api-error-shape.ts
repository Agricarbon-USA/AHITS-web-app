// UXP-6 (6a): ONE reader for the three error envelopes the API routes actually
// emit, so every create/edit form stops hand-rolling `typeof d.error === 'string'`
// ladders (and stops showing `JSON.stringify(error)` — inventory/page.tsx:185).
//
// Shapes in use (grep `NextResponse.json({ error:` under src/app/api):
//   1. `{ error: 'Vehicle name already in use' }`          — plain string (route-helpers `fail`, 409s, 500s)
//   2. `{ error: { fieldErrors, formErrors } }`            — zod `parsed.error.flatten()` (most routes)
//   3. `{ error: { name: ['Required'], vin: ['Too long'] } }` — zod `flatten().fieldErrors` only
//      (vehicles/[id], inventory/[id], inventory/[id]/stock, users/invite, projects/[id], …)
// Also tolerated because they are cheap and common: a top-level `{ fieldErrors, formErrors }`,
// `{ message }`, `{ error: { message } }`, a bare string body, and garbage (null, HTML, numbers).
//
// Pure — no React, no DOM — so it is unit-testable under either vitest config.

export interface ParsedApiError {
  /** One form-level message for the Alert above the fields, or null when the
   *  failure is entirely field-level (then render `fieldErrors` inline). */
  formError: string | null
  /** First message per field, keyed by the zod path's top-level key. */
  fieldErrors: Record<string, string>
}

type FieldErrorMap = Record<string, string[] | undefined>

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function nonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function firstString(v: unknown): string | null {
  if (nonEmpty(v)) return v.trim()
  if (Array.isArray(v)) {
    for (const x of v) if (nonEmpty(x)) return x.trim()
  }
  return null
}

/** `{ name: ['msg'], vin: undefined }` → `{ name: 'msg' }` (first message per field). */
function collapseFieldErrors(map: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!isRecord(map)) return out
  for (const [key, msgs] of Object.entries(map as FieldErrorMap)) {
    const msg = firstString(msgs)
    if (msg) out[key] = msg
  }
  return out
}

/** A bare `flatten().fieldErrors` map: every value is an array of strings (or undefined). */
function looksLikeBareFieldMap(v: unknown): v is FieldErrorMap {
  if (!isRecord(v)) return false
  const entries = Object.entries(v)
  if (entries.length === 0) return false
  return entries.every(([, val]) => val === undefined || (Array.isArray(val) && val.every((m) => typeof m === 'string')))
}

/**
 * Normalise any API error body into `{ formError, fieldErrors }`.
 *
 * - `formError` is the top-level message when the server sent one (string envelope,
 *   `formErrors[0]`, `message`). When the server sent ONLY field errors it is `null`,
 *   so the caller renders them inline instead of a redundant banner. When nothing
 *   usable is found it is `fallback` — never an empty string, never `JSON.stringify`.
 * - `fieldErrors` is always an object (possibly empty), one message per field.
 */
export function parseApiError(body: unknown, fallback: string): ParsedApiError {
  const none: ParsedApiError = { formError: fallback, fieldErrors: {} }

  // A non-JSON body (text/plain 500, HTML from a proxy). Only trust short strings —
  // an HTML page is not a message.
  if (typeof body === 'string') {
    return nonEmpty(body) && body.length <= 300 && !/^\s*</.test(body) ? { formError: body.trim(), fieldErrors: {} } : none
  }
  if (!isRecord(body)) return none

  // Where do the zod parts live? Under `error` (shapes 2/3) or at the top level.
  const err = body.error
  let flat: unknown = null
  if (isRecord(err) && ('fieldErrors' in err || 'formErrors' in err)) flat = err
  else if ('fieldErrors' in body || 'formErrors' in body) flat = body

  if (isRecord(flat)) {
    const fieldErrors = collapseFieldErrors(flat.fieldErrors)
    const formError = firstString(flat.formErrors)
    if (formError) return { formError, fieldErrors }
    if (Object.keys(fieldErrors).length > 0) return { formError: null, fieldErrors }
    return none
  }

  // Shape 1: `{ error: '…' }`.
  if (nonEmpty(err)) return { formError: err.trim(), fieldErrors: {} }

  // Shape 3: `{ error: { name: ['Required'] } }`.
  if (looksLikeBareFieldMap(err)) {
    const fieldErrors = collapseFieldErrors(err)
    return Object.keys(fieldErrors).length > 0 ? { formError: null, fieldErrors } : none
  }

  // `{ error: { message } }` / `{ message }`.
  if (isRecord(err) && nonEmpty(err.message)) return { formError: err.message.trim(), fieldErrors: {} }
  if (nonEmpty(body.message)) return { formError: body.message.trim(), fieldErrors: {} }

  return none
}

/** The first field message, or null. Accepts the parsed result or a raw field map. */
export function firstFieldError(source: ParsedApiError | Record<string, string>): string | null {
  const map = 'fieldErrors' in source && isRecord(source.fieldErrors) ? source.fieldErrors : (source as Record<string, string>)
  for (const msg of Object.values(map)) if (nonEmpty(msg)) return msg
  return null
}

/**
 * One line for callers that surface errors as a toast rather than inline:
 * the form-level message, else the first field message (prefixed with its
 * field so "Required" is not a mystery), else `fallback`.
 */
export function apiErrorMessage(body: unknown, fallback: string): string {
  const parsed = parseApiError(body, fallback)
  if (parsed.formError) return parsed.formError
  const [field, msg] = Object.entries(parsed.fieldErrors)[0] ?? []
  return field && msg ? `${humanizeField(field)}: ${msg}` : fallback
}

/** `licensePlate` → `License plate`; `vin` → `Vin` (callers with better labels map themselves). */
export function humanizeField(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}
