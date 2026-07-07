import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { extractStoragePath, toPhotoSrc, isAllowedPhotoUrl } from '../src/lib/photo-security'

// isAllowedPhotoUrl checks the photo host against NEXT_PUBLIC_SUPABASE_URL. Pin it to
// the fixtures' host so the allowlist assertions are deterministic regardless of the
// ambient env (a real Supabase URL in .env would otherwise reject the abc.supabase.co
// fixtures). Read at call time in the source, so a plain stubEnv is sufficient.
beforeEach(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co') })
afterEach(() => { vi.unstubAllEnvs() })

// UR-005b: photos live in a PRIVATE bucket and render only through the auth-gated
// proxy `/api/photos/<path>`. These helpers must (a) resolve any reference form to
// the bucket object path, (b) rewrite references to the proxy URL for rendering,
// and (c) reject traversal / foreign / unresolved refs at the persist boundary.

const PROXY = '/api/photos/rig-events/u123/1700000000-photo.jpg'
const LEGACY_PUBLIC = 'https://abc.supabase.co/storage/v1/object/public/photos/rig-events/u123/1700000000-photo.jpg'
const LEGACY_SIGNED = 'https://abc.supabase.co/storage/v1/object/sign/photos/rig-events/u123/1700000000-photo.jpg?token=xyz'

describe('UR-005b: extractStoragePath', () => {
  it('resolves the proxy, public, and signed reference forms to the same object path', () => {
    expect(extractStoragePath(PROXY)).toBe('rig-events/u123/1700000000-photo.jpg')
    expect(extractStoragePath(LEGACY_PUBLIC)).toBe('rig-events/u123/1700000000-photo.jpg')
    expect(extractStoragePath(LEGACY_SIGNED)).toBe('rig-events/u123/1700000000-photo.jpg')
  })
  it('rejects traversal, foreign origins, and unresolved refs', () => {
    expect(extractStoragePath('/api/photos/../../etc/passwd')).toBeNull()
    expect(extractStoragePath('https://evil.example.com/photos/x.jpg')).toBeNull()
    expect(extractStoragePath('localphoto:abc-123')).toBeNull()
    expect(extractStoragePath('')).toBeNull()
    expect(extractStoragePath(null)).toBeNull()
  })
})

describe('UR-005b: toPhotoSrc', () => {
  it('rewrites any valid reference to the proxy URL', () => {
    expect(toPhotoSrc(LEGACY_PUBLIC)).toBe(PROXY)
    expect(toPhotoSrc(LEGACY_SIGNED)).toBe(PROXY)
    expect(toPhotoSrc(PROXY)).toBe(PROXY)
  })
  it('returns empty string for an invalid reference (no broken <img>)', () => {
    expect(toPhotoSrc('localphoto:abc')).toBe('')
    expect(toPhotoSrc('https://evil.example.com/x.jpg')).toBe('')
  })
})

describe('UR-005b: isAllowedPhotoUrl (persist boundary)', () => {
  it('accepts the proxy ref and legacy Supabase storage URLs', () => {
    expect(isAllowedPhotoUrl(PROXY)).toBe(true)
    expect(isAllowedPhotoUrl(LEGACY_PUBLIC)).toBe(true)
    expect(isAllowedPhotoUrl(LEGACY_SIGNED)).toBe(true)
  })
  it('rejects traversal proxy refs, foreign URLs, and localphoto refs', () => {
    expect(isAllowedPhotoUrl('/api/photos/../secrets')).toBe(false)
    expect(isAllowedPhotoUrl('https://evil.example.com/x.jpg')).toBe(false)
    expect(isAllowedPhotoUrl('localphoto:abc')).toBe(false)
    expect(isAllowedPhotoUrl('')).toBe(false)
  })
})
