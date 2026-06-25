import { describe, it, expect } from 'vitest'
import {
  extractCreatedId,
  isPlaceholderId,
  newPlaceholderId,
  itemReferencesPlaceholder,
  remapPlaceholderId,
} from '@/lib/offline-remap'
import type { OfflineQueueItem } from '@/types'

function qi(partial: Partial<OfflineQueueItem>): OfflineQueueItem {
  return { endpoint: '/x', method: 'POST', body: undefined, createdAt: 0, retries: 0, ...partial }
}

describe('offline-remap (M1-9 dependent-write id remapping)', () => {
  it('generates recognizable, unique placeholder ids', () => {
    const a = newPlaceholderId()
    const b = newPlaceholderId()
    expect(isPlaceholderId(a)).toBe(true)
    expect(a).not.toBe(b)
    expect(isPlaceholderId('real-123')).toBe(false)
  })

  it('extracts a created id from {id} and {data:{id}} only', () => {
    expect(extractCreatedId({ id: 'r1' })).toBe('r1')
    expect(extractCreatedId({ data: { id: 'r2' } })).toBe('r2')
    expect(extractCreatedId({})).toBeNull()
    expect(extractCreatedId(null)).toBeNull()
    expect(extractCreatedId({ id: 123 })).toBeNull() // non-string id ignored
  })

  it('detects placeholder references in endpoint and body', () => {
    const ph = 'pending-abc'
    expect(itemReferencesPlaceholder(qi({ endpoint: `/api/deployments/${ph}/items` }), ph)).toBe(true)
    expect(itemReferencesPlaceholder(qi({ endpoint: '/x', body: { rigId: ph } }), ph)).toBe(true)
    expect(itemReferencesPlaceholder(qi({ endpoint: '/x', body: { rigId: 'real' } }), ph)).toBe(false)
  })

  it('remaps the placeholder in both endpoint and body', () => {
    const ph = 'pending-abc'
    const item = qi({ endpoint: `/api/deployments/${ph}/items`, body: { rigId: ph, note: 'hi' } })
    const out = remapPlaceholderId(item, ph, 'real-1')
    expect(out.endpoint).toBe('/api/deployments/real-1/items')
    expect(out.body).toEqual({ rigId: 'real-1', note: 'hi' })
  })

  it('returns the same reference (no churn) when the placeholder is absent', () => {
    const item = qi({ endpoint: '/api/x', body: { a: 1 } })
    expect(remapPlaceholderId(item, 'pending-zzz', 'real')).toBe(item)
  })

  it('does not touch unrelated strings that merely share a prefix', () => {
    const item = qi({ endpoint: '/api/deployments/real/items', body: { note: 'pending review' } })
    expect(remapPlaceholderId(item, 'pending-abc', 'X')).toBe(item)
  })
})
