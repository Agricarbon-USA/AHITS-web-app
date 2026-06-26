import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractStoragePath, PHOTO_PROXY_PREFIX, STORAGE_BUCKET } from '@/lib/photo-security'

// UR-005b: auth-gated photo proxy for the PRIVATE `photos` bucket.
//
// Photos are no longer world-readable via enumerable public URLs. Every render
// goes through this route, which requires an authenticated session and then
// streams the object using the service-role key. The stored reference is the
// object path (rendered as `/api/photos/<path>`); this route resolves it back to
// the bucket object. Path traversal is rejected by extractStoragePath.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { path } = await params
  const objectPath = extractStoragePath(PHOTO_PROXY_PREFIX + path.map(encodeURIComponent).join('/'))
  if (!objectPath) return NextResponse.json({ error: 'Bad path' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(objectPath)
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const buffer = Buffer.from(await data.arrayBuffer())
  // The stored object's content-type is authoritative — we only ever write a
  // magic-byte-sniffed type at upload time (UR-005), so it is safe to serve.
  const contentType = data.type || 'application/octet-stream'
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      // Private + short cache: a CDN/proxy must not share it across users.
      'Cache-Control': 'private, max-age=300',
    },
  })
}
