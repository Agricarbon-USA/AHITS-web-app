// CC-25: shared QR decode step for the live viewfinder + still-image fallback.
// Isolated in its own module so QrScannerDialog stays thin and this can be
// vi.mock()'d in component tests (jsdom has no camera / BarcodeDetector / canvas
// pixels). Two strategies, one interface:
//   • BarcodeDetector (native, hardware-accelerated) where the platform has it.
//     NOT on iOS Safari — so the jsQR path below is the real iOS path.
//   • jsQR fallback, run on a DOWNSCALED frame (≤640px long edge). The caller
//     rate-caps this (≤8 decodes/sec) — running full-res jsQR every rAF frame is
//     a battery/thermal sink.

// ── BarcodeDetector (not in lib.dom) — minimal ambient shape ─────────────────
interface DetectedBarcode {
  rawValue: string
  format: string
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
type BarcodeDetectorCtor = {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

/** Returns a native QR BarcodeDetector if the platform supports it, else null. */
export function createBarcodeDetector(): BarcodeDetectorLike | null {
  if (typeof window === 'undefined') return null
  const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  if (!Ctor) return null
  try {
    return new Ctor({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

// jsQR is dynamically imported once (not per frame) and cached.
let jsQRImpl: typeof import('jsqr') | null = null
async function getJsQR() {
  if (!jsQRImpl) jsQRImpl = (await import('jsqr')).default as unknown as typeof import('jsqr')
  return jsQRImpl
}

const MAX_EDGE = 640

// Draw `source` onto `canvas`, downscaled so the long edge is ≤ MAX_EDGE, and
// return the 2D context + dimensions. Reuses the caller's canvas each frame.
function drawDownscaled(
  source: HTMLVideoElement | ImageBitmap,
  canvas: HTMLCanvasElement,
): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.width
  const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.height
  if (!sw || !sh) return null
  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh))
  const w = Math.round(sw * scale)
  const h = Math.round(sh * scale)
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(source, 0, 0, w, h)
  return { ctx, w, h }
}

async function decodeWithJsQR(
  source: HTMLVideoElement | ImageBitmap,
  canvas: HTMLCanvasElement,
): Promise<string | null> {
  const drawn = drawDownscaled(source, canvas)
  if (!drawn) return null
  const { ctx, w, h } = drawn
  const img = ctx.getImageData(0, 0, w, h)
  const jsQR = await getJsQR()
  const result = jsQR(img.data, w, h)
  return result?.data ?? null
}

/**
 * Decode one frame from a live <video>. Uses `detector` (BarcodeDetector) when
 * provided, else the downscaled jsQR path. `canvas` is a scratch canvas the
 * caller owns and reuses. Returns the raw QR payload or null.
 */
export async function decodeFromVideo(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  detector: BarcodeDetectorLike | null,
): Promise<string | null> {
  if (detector) {
    try {
      const codes = await detector.detect(video)
      return codes[0]?.rawValue ?? null
    } catch {
      // A per-frame detect() failure (e.g. video not ready) is non-fatal — the
      // loop just tries the next frame.
      return null
    }
  }
  return decodeWithJsQR(video, canvas)
}

/**
 * Decode a still image (the permission-denied / no-camera photo-capture path,
 * relocated here from the old per-site handlers). Always uses jsQR — a captured
 * photo is a one-shot, so BarcodeDetector's live advantage doesn't apply.
 */
export async function decodeFromImage(bitmap: ImageBitmap, canvas: HTMLCanvasElement): Promise<string | null> {
  return decodeWithJsQR(bitmap, canvas)
}
