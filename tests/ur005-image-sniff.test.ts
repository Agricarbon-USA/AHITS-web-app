import { describe, it, expect } from 'vitest'
import { sniffImageMime, extForImageMime } from '../src/lib/photo-security'

// UR-005: the upload route must trust magic bytes, not the client-supplied MIME.
// SVG (which can carry <script>) and other mislabeled payloads must be rejected
// so they never get stored + served from our storage origin (stored-XSS vector).

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
const gif = Buffer.from('GIF89a______', 'ascii')
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')])
const heic = Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from('ftypheic')])
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
const html = Buffer.from('<!DOCTYPE html><html><body>nope</body></html>')

describe('UR-005: image magic-byte sniffing', () => {
  it('detects real raster image formats', () => {
    expect(sniffImageMime(png)).toBe('image/png')
    expect(sniffImageMime(jpeg)).toBe('image/jpeg')
    expect(sniffImageMime(gif)).toBe('image/gif')
    expect(sniffImageMime(webp)).toBe('image/webp')
    expect(sniffImageMime(heic)).toBe('image/heic')
  })

  it('rejects SVG and other mislabeled non-images', () => {
    expect(sniffImageMime(svg)).toBeNull()
    expect(sniffImageMime(html)).toBeNull()
    expect(sniffImageMime(Buffer.from([0, 1, 2]))).toBeNull()
  })

  it('maps a sniffed mime to a safe file extension', () => {
    expect(extForImageMime('image/jpeg')).toBe('jpg')
    expect(extForImageMime('image/png')).toBe('png')
    expect(extForImageMime('image/heic')).toBe('heic')
    expect(extForImageMime('image/svg+xml')).toBe('img')
  })
})
