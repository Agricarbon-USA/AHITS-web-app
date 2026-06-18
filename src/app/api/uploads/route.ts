import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { detectImageMime } from '@/lib/image-validation'
import { rateLimit } from '@/lib/rate-limit'

const BUCKET = 'photos'
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
// Per-user upload throttle (SEC-3): one authenticated user shouldn't be able to
// fire unbounded 10 MB writes into storage. Generous enough for a normal damage
// burst, low enough to bound cost/DoS abuse.
const UPLOAD_LIMIT = 40
const UPLOAD_WINDOW_MS = 60 * 1000

export async function POST(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = rateLimit(`upload:${session.userId}`, UPLOAD_LIMIT, UPLOAD_WINDOW_MS)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many uploads. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

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

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Validate by magic bytes, not the spoofable client-declared file.type (SEC-3).
  // SVG and any non-raster format are rejected. Use the sniffed type as the
  // stored Content-Type so the bucket can never serve a mislabelled file.
  const detectedMime = detectImageMime(buffer)
  if (!detectedMime) {
    return NextResponse.json(
      { error: 'Only JPEG, PNG, WebP, GIF, or HEIC images are allowed.' },
      { status: 415 },
    )
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const path = `rig-events/${session.userId}/${Date.now()}-${safeName}`

  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: detectedMime, upsert: false })

  if (error) {
    console.error('[uploads] Supabase storage error:', error.message)
    return NextResponse.json({ error: 'Upload failed: ' + error.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
  return NextResponse.json({ url: publicUrl })
}
