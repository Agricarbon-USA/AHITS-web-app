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

// Security response headers applied to every route. CSP keeps frame-ancestors
// locked (clickjacking) and constrains base-uri/form-action/object-src while
// remaining compatible with Next's inline bootstrap and Emotion/MUI inline
// styles. A nonce-based strict script-src is a tracked follow-up.
const cspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: cspDirectives },
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
