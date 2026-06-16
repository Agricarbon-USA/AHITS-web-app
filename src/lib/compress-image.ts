/**
 * Compress an image file client-side using the Canvas API before upload.
 *
 * - Resizes to at most `maxWidth` pixels wide (preserving aspect ratio)
 * - Re-encodes as JPEG at `quality` (0–1)
 * - Skips compression for tiny files (< 200 KB) — not worth the overhead
 * - Skips if the browser doesn't support Canvas (returns original file)
 *
 * Typical results: 5 MB phone photo → ~300–500 KB at 1920 px / 0.8 quality.
 */
export async function compressImage(
  file: File,
  maxWidth = 1920,
  quality = 0.8,
): Promise<File> {
  // Not an image or too small to bother
  if (!file.type.startsWith('image/') || file.size < 200 * 1024) return file

  return new Promise((resolve) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)

      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(file); return }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return }
          // Only use the compressed version if it's actually smaller
          if (blob.size >= file.size) { resolve(file); return }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
        },
        'image/jpeg',
        quality,
      )
    }

    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file) }
    img.src = objectUrl
  })
}
