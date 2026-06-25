import { describe, it, expect } from 'vitest'
import { resolvePhotoRefs, LOCAL_PHOTO_PREFIX, type ResolveDeps } from '../src/lib/photoStore'

// resolvePhotoRefs is the core of offline photo support: it walks a queued
// request body, uploads any `localphoto:` blobs, and swaps in the real URLs
// before the request is (re)sent. Deps are injected so this runs without
// IndexedDB or a network.

function makeDeps(over: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    getBlob: async () => new Blob(['x']),
    upload: async () => 'https://cdn/uploaded.jpg',
    deleteBlob: async () => {},
    ...over,
  }
}

describe('resolvePhotoRefs', () => {
  it('returns the same body reference when there are no local refs (fast path)', async () => {
    const body = { note: 'hi', photoUrls: ['https://cdn/a.jpg'] }
    const out = await resolvePhotoRefs(body, makeDeps())
    expect(out).toBe(body) // untouched — non-photo writes pay no cost
  })

  it('uploads local refs and substitutes URLs, preserving structure and existing URLs', async () => {
    const uploaded: string[] = []
    const deps = makeDeps({
      upload: async () => {
        const u = `https://cdn/u${uploaded.length}.jpg`
        uploaded.push(u)
        return u
      },
    })
    const body = {
      note: 'damage',
      itemDispositions: [
        { kitItemId: 'k1', photoUrls: [`${LOCAL_PHOTO_PREFIX}abc`, 'https://cdn/existing.jpg'] },
        { kitItemId: 'k2', photoUrls: [] },
      ],
    }
    const out = (await resolvePhotoRefs(body, deps)) as typeof body
    expect(out.itemDispositions[0].photoUrls).toEqual(['https://cdn/u0.jpg', 'https://cdn/existing.jpg'])
    expect(out.itemDispositions[1].photoUrls).toEqual([])
    expect(out.note).toBe('damage')
    expect(uploaded).toHaveLength(1)
  })

  it('drops a local ref whose blob is gone (already uploaded / evicted)', async () => {
    const deps = makeDeps({ getBlob: async () => null })
    const body = { photoUrls: [`${LOCAL_PHOTO_PREFIX}gone`, 'https://cdn/keep.jpg'] }
    const out = (await resolvePhotoRefs(body, deps)) as typeof body
    expect(out.photoUrls).toEqual(['https://cdn/keep.jpg'])
  })

  it('throws when an upload fails so the queue can retry on the next sync', async () => {
    const deps = makeDeps({
      upload: async () => {
        throw new Error('offline')
      },
    })
    const body = { photoUrls: [`${LOCAL_PHOTO_PREFIX}x`] }
    await expect(resolvePhotoRefs(body, deps)).rejects.toThrow()
  })

  it('deletes NO blobs when a later upload in the batch fails (no partial-batch photo loss)', async () => {
    const deleted: string[] = []
    let calls = 0
    const deps = makeDeps({
      upload: async () => {
        calls += 1
        if (calls === 2) throw new Error('connection dropped')
        return `https://cdn/u${calls}.jpg`
      },
      deleteBlob: async (ref) => {
        deleted.push(ref)
      },
    })
    const body = { photoUrls: [`${LOCAL_PHOTO_PREFIX}a`, `${LOCAL_PHOTO_PREFIX}b`] }
    await expect(resolvePhotoRefs(body, deps)).rejects.toThrow()
    // The first photo uploaded, but its blob must NOT be deleted — otherwise the
    // retry (which re-walks the original body) would lose it.
    expect(deleted).toEqual([])
  })
})
