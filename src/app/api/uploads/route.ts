import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { sniffImageMime, extForImageMime, isPdf } from '@/lib/photo-security'

const BUCKET = 'photos'
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 413 })
  }

  // `kind=document` (e.g. a rental agreement) additionally allows PDF; the
  // default is image-only. PDFs are never images, so they can't be an SVG-style
  // stored-XSS vector, and we still gate on magic bytes (never the client MIME).
  const kind = formData.get('kind') === 'document' ? 'document' : 'image'

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // UR-005: authoritative content-type from magic bytes, never the client's
  // `file.type` claim. Rejects SVG / mislabeled non-images (stored-XSS vector).
  const imageMime = sniffImageMime(buffer)
  const mime = imageMime ?? (kind === 'document' && isPdf(buffer) ? 'application/pdf' : null)
  if (!mime) {
    return NextResponse.json(
      {
        error: kind === 'document'
          ? 'Only real images (JPEG, PNG, WebP, GIF, HEIC) or a PDF are allowed.'
          : 'Only real image files are allowed (JPEG, PNG, WebP, GIF, or HEIC).',
      },
      { status: 415 },
    )
  }

  // Force the extension to match the sniffed type so a mislabeled name (e.g.
  // "photo.svg") can never end up in the stored path.
  const ext = mime === 'application/pdf' ? 'pdf' : extForImageMime(mime)
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 64) || 'upload'
  const path = `rig-events/${session.userId}/${Date.now()}-${base}.${ext}`

  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mime, upsert: false })

  if (error) {
    console.error('[uploads] Supabase storage error:', error.message)
    return NextResponse.json({ error: 'Upload failed: ' + error.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
  return NextResponse.json({ url: publicUrl })
}
