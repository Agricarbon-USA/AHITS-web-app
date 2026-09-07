import { describe, it, expect } from 'vitest'
import { parseApiError, firstFieldError, apiErrorMessage, humanizeField } from '@/lib/api-error-shape'

// UXP-6 (6a): one reader for the three error envelopes the API routes emit
// (`{error:'…'}` · zod `flatten()` under `error` · bare `flatten().fieldErrors`
// under `error`), so no form ever shows `JSON.stringify(error)` again.

const FALLBACK = 'Save failed'

describe('parseApiError — shape 1: plain string envelope', () => {
  it('uses the string as the form error', () => {
    expect(parseApiError({ error: 'Vehicle name already in use' }, FALLBACK)).toEqual({
      formError: 'Vehicle name already in use',
      fieldErrors: {},
    })
  })

  it('trims and rejects an empty string (falls back)', () => {
    expect(parseApiError({ error: '   ' }, FALLBACK).formError).toBe(FALLBACK)
    expect(parseApiError({ error: '  Forbidden ' }, FALLBACK).formError).toBe('Forbidden')
  })
})

describe('parseApiError — shape 2: zod flatten() under error', () => {
  it('collapses fieldErrors to one message per field and leaves formError null', () => {
    const body = { error: { fieldErrors: { name: ['Required', 'Too short'], vin: ['Too long'], notes: undefined }, formErrors: [] } }
    expect(parseApiError(body, FALLBACK)).toEqual({
      formError: null,
      fieldErrors: { name: 'Required', vin: 'Too long' },
    })
  })

  it('surfaces formErrors[0] as the form error alongside the field map', () => {
    const body = { error: { fieldErrors: { hubId: ['Pick a hub'] }, formErrors: ['A hub is required when quantity > 0', 'second'] } }
    expect(parseApiError(body, FALLBACK)).toEqual({
      formError: 'A hub is required when quantity > 0',
      fieldErrors: { hubId: 'Pick a hub' },
    })
  })

  it('falls back when both parts are empty', () => {
    expect(parseApiError({ error: { fieldErrors: {}, formErrors: [] } }, FALLBACK)).toEqual({ formError: FALLBACK, fieldErrors: {} })
  })

  it('also accepts the flattened parts at the top level', () => {
    expect(parseApiError({ fieldErrors: { qty: ['Must be ≥ 1'] } }, FALLBACK)).toEqual({ formError: null, fieldErrors: { qty: 'Must be ≥ 1' } })
    expect(parseApiError({ formErrors: ['Nope'] }, FALLBACK).formError).toBe('Nope')
  })
})

describe('parseApiError — shape 3: bare flatten().fieldErrors under error', () => {
  it('reads a field → string[] map', () => {
    const body = { error: { name: ['Required'], licensePlate: ['Invalid plate'], year: undefined } }
    expect(parseApiError(body, FALLBACK)).toEqual({
      formError: null,
      fieldErrors: { name: 'Required', licensePlate: 'Invalid plate' },
    })
  })

  it('does not mistake an object with non-array values for a field map', () => {
    expect(parseApiError({ error: { code: 'VEHICLE_IN_USE', unitId: 'u1' } }, FALLBACK)).toEqual({ formError: FALLBACK, fieldErrors: {} })
  })
})

describe('parseApiError — tolerated extras and garbage', () => {
  it('reads { message } and { error: { message } }', () => {
    expect(parseApiError({ message: 'Rate limited' }, FALLBACK).formError).toBe('Rate limited')
    expect(parseApiError({ error: { message: 'Boom' } }, FALLBACK).formError).toBe('Boom')
  })

  it('accepts a short plain-text body but not an HTML page', () => {
    expect(parseApiError('Internal error', FALLBACK).formError).toBe('Internal error')
    expect(parseApiError('<!doctype html><html>…</html>', FALLBACK).formError).toBe(FALLBACK)
    expect(parseApiError('x'.repeat(301), FALLBACK).formError).toBe(FALLBACK)
  })

  // Each case wrapped in its own array so vitest does not spread array bodies as arguments.
  it.each([[null], [undefined], [42], [true], [[]], [[1, 2]], [{}], [{ error: null }], [{ error: 7 }], [{ error: [] }], [{ error: {} }], ['']])(
    'falls back on garbage %j',
    (body) => {
      expect(parseApiError(body, FALLBACK)).toEqual({ formError: FALLBACK, fieldErrors: {} })
    },
  )

  it('never returns an empty-string formError', () => {
    expect(parseApiError({ error: { formErrors: [''] , fieldErrors: {} } }, FALLBACK).formError).toBe(FALLBACK)
  })
})

describe('firstFieldError / apiErrorMessage / humanizeField', () => {
  it('firstFieldError reads the parsed result or a raw map', () => {
    expect(firstFieldError(parseApiError({ error: { name: ['Required'] } }, FALLBACK))).toBe('Required')
    expect(firstFieldError({ vin: 'Bad VIN', name: 'Required' })).toBe('Bad VIN')
    expect(firstFieldError({})).toBeNull()
    expect(firstFieldError(parseApiError({ error: 'x' }, FALLBACK))).toBeNull()
  })

  it('apiErrorMessage prefers the form error, then "Field: message", then the fallback', () => {
    expect(apiErrorMessage({ error: 'Duplicate name' }, FALLBACK)).toBe('Duplicate name')
    expect(apiErrorMessage({ error: { licensePlate: ['Invalid plate'] } }, FALLBACK)).toBe('License plate: Invalid plate')
    expect(apiErrorMessage({ error: { fieldErrors: { name: ['Required'] }, formErrors: ['Fix the form'] } }, FALLBACK)).toBe('Fix the form')
    expect(apiErrorMessage('<html>', FALLBACK)).toBe(FALLBACK)
  })

  it('humanizeField splits camelCase and snake_case', () => {
    expect(humanizeField('licensePlate')).toBe('License plate')
    expect(humanizeField('low_stock_threshold')).toBe('Low stock threshold')
    expect(humanizeField('vin')).toBe('Vin')
  })
})
