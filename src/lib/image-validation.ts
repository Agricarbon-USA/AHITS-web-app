// ─────────────────────────────────────────────────────────────────────────
// Image validation by magic bytes (SEC-3)
//
// `file.type` from a multipart upload is client-supplied and trivially spoofed,
// so we never trust it. We sniff the actual file signature and accept only real
// raster image formats. SVG is intentionally NOT accepted: it is XML that can
// carry <script>, a stored-XSS vector when served from our origin.
//
// Returns the detected MIME type, or null if the bytes are not a recognised
// raster image. Callers should use the returned type as the stored
// Content-Type rather than the client-declared one.
// ─────────────────────────────────────────────────────────────────────────

const HEIF_BRANDS = new Set([
  'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1',
])

export function detectImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png'

  // GIF: "GIF8"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif'

  // WebP: "RIFF"...."WEBP"
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp'

  // HEIC/HEIF: "ftyp" box at offset 4, then a known brand at offset 8.
  if (buf.toString('ascii', 4, 8) === 'ftyp' && HEIF_BRANDS.has(buf.toString('ascii', 8, 12))) {
    return 'image/heic'
  }

  return null
}
