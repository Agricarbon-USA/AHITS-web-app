import type { NextConfig } from 'next'
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development' || process.env.DISABLE_SW === 'true',
  register: true,
})

// Server Actions are not used in this app (all mutations are API routes), so we
// do NOT set serverActions.allowedOrigins: ['*'] — that wildcard disabled the
// built-in same-origin check for no benefit. If Server Actions are ever added,
// set ALLOWED_ORIGINS (comma-separated hostnames) rather than re-introducing '*'.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// CSP is generated per-request in src/proxy.ts with a nonce so that
// script-src can drop 'unsafe-inline'. Only the non-CSP security headers
// live here; they are static and apply to every route including redirects.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
]

const nextConfig: NextConfig = {
  output: 'standalone', // Required for Cloud Run / Docker
  ...(allowedOrigins.length > 0 && {
    experimental: { serverActions: { allowedOrigins } },
  }),
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default withSerwist(nextConfig)
