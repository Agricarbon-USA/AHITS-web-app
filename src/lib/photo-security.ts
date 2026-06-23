// Photo URL origin validation (M4 / photo-security).
//
// Photo URLs are supplied by the client (the upload route returns a Supabase
// storage URL, but the client echoes it back when persisting Photo rows). Without
// validation a malicious client could store an arbitrary external URL that then
// renders in the admin UI and on the login-less shop/hub status page — a stored
// content-injection / phishing vector. We persist only URLs that point at our
// own Supabase storage object endpoint.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

/** True if `url` points at our Supabase storage object endpoint (public or signed). */
export function isAllowedPhotoUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length === 0) return false
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false // not an absolute URL (e.g. an unresolved "localphoto:" ref)
  }
  if (u.protocol !== 'https:') return false
  // Must hit a Supabase storage object path (…/storage/v1/object/{public|sign}/…).
  if (!u.pathname.includes('/storage/v1/object/')) return false
  if (SUPABASE_URL) {
    try {
      return u.host === new URL(SUPABASE_URL).host
    } catch {
      /* fall through to the generic host check */
    }
  }
  // No configured origin (tests/local) — require a Supabase-hosted bucket.
  return u.hostname.endsWith('.supabase.co')
}

/** Keep only the photo URLs that pass origin validation. */
export function filterAllowedPhotoUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return []
  return urls.filter(isAllowedPhotoUrl)
}
