// ─────────────────────────────────────────────────────────────────────────
// Client-side image compression
//
// Field photos come straight off a phone camera and can be 3–8 MB. We resize
// the longest edge down to `maxDim` and re-encode as JPEG before upload/queue,
// which keeps offline storage small and uploads fast on a weak signal. The
// canvas redraw also normalises EXIF orientation and strips metadata.
//
// Best-effort: if anything about the canvas pipeline fails (very old WebView,
// unsupported codec), we fall back to the original file so a photo is never
// lost — it just uploads uncompressed.
// ─────────────────────────────────────────────────────────────────────────

export async function compressImage(
  file: File | Blob,
  maxDim = 1600,
  quality = 0.8,
): Promise<Blob> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    return file
  }
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    } as ImageBitmapOptions)
    const longest = Math.max(bitmap.width, bitmap.height)
    const scale = longest > maxDim ? maxDim / longest : 1
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close?.()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
    )
    return blob ?? file
  } catch {
    return file
  }
}
