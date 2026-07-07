// Photo URL origin validation (M4 / photo-security).
//
// Photo URLs are supplied by the client (the upload route returns a Supabase
// storage URL, but the client echoes it back when persisting Photo rows). Without
// validation a malicious client could store an arbitrary external URL that then
// renders in the admin UI and on the login-less shop/hub status page — a stored
// content-injection / phishing vector. We persist only URLs that point at our
// own Supabase storage object endpoint.

// UR-005b: photos live in a PRIVATE bucket. They are never rendered from a public
// Supabase URL; instead every reference is rewritten to the auth-gated proxy
// `/api/photos/<object-path>` (see src/app/api/photos/[...path]/route.ts), which
// streams the object via the service-role key only for an authenticated session.
export const PHOTO_PROXY_PREFIX = '/api/photos/'
export const STORAGE_BUCKET = 'photos'

/** Reject path traversal / absolute escapes in an object path. */
function safeObjectPath(p: string): string | null {
  const clean = p.replace(/^\/+/, '')
  if (!clean || clean.includes('..') || clean.includes('\\') || clean.includes('\0')) return null
  return clean
}

/**
 * Extract the object path within our `photos` bucket from any photo reference:
 *  - a render proxy URL  `/api/photos/<path>`
 *  - a legacy Supabase URL `…/storage/v1/object/{public|sign}/photos/<path>`
 * Returns null if the ref doesn't point at our bucket.
 */
export function extractStoragePath(ref: unknown): string | null {
  if (typeof ref !== 'string' || ref.length === 0) return null
  if (ref.startsWith(PHOTO_PROXY_PREFIX)) {
    return safeObjectPath(decodeURIComponent(ref.slice(PHOTO_PROXY_PREFIX.length).split('?')[0]))
  }
  try {
    const u = new URL(ref)
    const marker = `/${STORAGE_BUCKET}/`
    const idx = u.pathname.indexOf(marker)
    if (u.pathname.includes('/storage/v1/object/') && idx !== -1) {
      return safeObjectPath(decodeURIComponent(u.pathname.slice(idx + marker.length)))
    }
    return null
  } catch {
    return null // not an absolute URL (e.g. an unresolved "localphoto:" ref)
  }
}

/** Same-origin, auth-gated proxy URL for rendering a stored photo. '' if invalid. */
export function toPhotoSrc(ref: unknown): string {
  const path = extractStoragePath(ref)
  return path ? PHOTO_PROXY_PREFIX + path.split('/').map(encodeURIComponent).join('/') : ''
}

/**
 * True if `url` is a photo reference we will persist: either the auth-gated proxy
 * ref (`/api/photos/<path>`, what uploads now return) or a legacy Supabase storage
 * URL (public or signed). Everything else — including `localphoto:` refs and
 * arbitrary external URLs — is rejected.
 */
export function isAllowedPhotoUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length === 0) return false
  if (url.startsWith(PHOTO_PROXY_PREFIX)) return extractStoragePath(url) !== null
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false // not an absolute URL (e.g. an unresolved "localphoto:" ref)
  }
  if (u.protocol !== 'https:') return false
  // Must hit a Supabase storage object path (…/storage/v1/object/{public|sign}/…).
  if (!u.pathname.includes('/storage/v1/object/')) return false
  // Read at call time (not module load) so the check is deterministic under test.
  // In production Next.js inlines NEXT_PUBLIC_* at build time, so this is a constant
  // either way — no runtime behavior change; it only makes the host allowlist stubbable.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (supabaseUrl) {
    try {
      return u.host === new URL(supabaseUrl).host
    } catch {
      /* fall through to the generic host check */
    }
  }
  // No configured origin (tests/local) — require a Supabase-hosted bucket. NOTE: this
  // generic fallback is deliberately looser and must NEVER be the production path:
  // NEXT_PUBLIC_SUPABASE_URL is a required Cloud Run runtime secret (Makefile env-check
  // hard-fails without it), so prod always takes the strict host-equality branch above.
  return u.hostname.endsWith('.supabase.co')
}

/** Keep only the photo URLs that pass origin validation. */
export function filterAllowedPhotoUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return []
  return urls.filter(isAllowedPhotoUrl)
}

// ── Upload content-type validation (UR-005) ─────────────────────────────────
//
// The browser-supplied `file.type` is attacker-controlled: a client can label an
// SVG (which can carry <script>) or arbitrary bytes as "image/png" and, once
// stored and served from our storage origin — including embedded in the
// login-less shop/hub status pages — open a stored-XSS / content-injection
// vector. We therefore derive the REAL type from the file's magic bytes and
// store the object with that sniffed content-type, never the client's claim.
// Only raster image formats are allowed; SVG (text/markup) is intentionally
// rejected.

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
}

/**
 * Detect a real raster-image MIME type from the leading bytes of a file.
 * Returns null for anything that isn't an allowed image (SVG, HTML, scripts,
 * or a mislabeled non-image), which the caller should reject.
 */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png'
  // GIF: "GIF87a" / "GIF89a"
  const gif = buf.toString('ascii', 0, 6)
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif'
  // WebP: "RIFF" …… "WEBP"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  // HEIC/HEIF (mobile camera): "ftyp" box at offset 4 + a HEIF brand
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12)
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'image/heic'
  }
  return null
}

/** Canonical file extension for a sniffed image MIME (for the stored object path). */
export function extForImageMime(mime: string): string {
  return IMAGE_EXT_BY_MIME[mime] ?? 'img'
}

/** True if the buffer is a real PDF (magic bytes "%PDF-"). Used for document
 *  uploads (e.g. rental agreements) where PDF is allowed alongside images. */
export function isPdf(buf: Buffer): boolean {
  return buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-'
}
