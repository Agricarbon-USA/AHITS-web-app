import { describe, it, expect } from 'vitest'
import { stableStringify, requestSignature } from '../src/lib/request-signature'

describe('requestSignature (Q1 double-submit dedup)', () => {
  it('is stable regardless of object key order', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }))
  })

  it('drops undefined-valued keys deterministically', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }))
  })

  it('preserves array order (order is significant)', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]))
  })

  it('keeps numbers and strings distinct', () => {
    expect(stableStringify({ q: 1 })).not.toBe(stableStringify({ q: '1' }))
  })

  it('matches two identical deploy-create intents (key order / nested order agnostic)', () => {
    const a = { label: undefined, note: 'x', vehicleIds: ['v1'], kitItems: [{ inventoryItemId: 'i1', quantity: 2 }] }
    const b = { note: 'x', vehicleIds: ['v1'], kitItems: [{ quantity: 2, inventoryItemId: 'i1' }], label: undefined }
    expect(requestSignature('POST', '/api/deployments', a)).toBe(requestSignature('POST', '/api/deployments', b))
  })

  it('distinguishes a genuinely different write (added sourceHubId)', () => {
    const base = { note: 'x', vehicleIds: ['v1'] }
    const withHub = { ...base, sourceHubId: 'h1' }
    expect(requestSignature('POST', '/api/deployments', base)).not.toBe(
      requestSignature('POST', '/api/deployments', withHub),
    )
  })

  it('includes method and endpoint in the signature', () => {
    expect(requestSignature('POST', '/a', {})).not.toBe(requestSignature('POST', '/b', {}))
    expect(requestSignature('POST', '/a', {})).not.toBe(requestSignature('PATCH', '/a', {}))
  })
})
