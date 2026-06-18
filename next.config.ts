import type { NextConfig } from 'next'
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development' || process.env.DISABLE_SW === 'true',
  register: true,
})

// Content-Security-Policy, shipped in Report-Only mode first (SEC-4). It is
// tuned for this app's stack: Emotion/MUI inject inline <style> (style-src
// 'unsafe-inline'); Next's App Router emits inline bootstrap/runtime scripts
// (script-src 'unsafe-inline' until a nonce pipeline lands); Serwist registers
// a service worker (worker-src 'self'); Supabase Storage serves images and the
// API is called over fetch (img-src/connect-src *.supabase.co). Violations are
// reported to /api/csp-report so we can watch staging, then flip to enforcing
// (rename the header to 'Content-Security-Policy') in a follow-up.
const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  'report-uri /api/csp-report',
].join('; ')

const securityHeaders = [
  // Enforced immediately — these are safe for the current stack.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // CSP starts in Report-Only so it can't break the live app while we tune it.
  { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
]

const nextConfig: NextConfig = {
  output: 'standalone', // Required for Cloud Run / Docker
  // NOTE: no `experimental.serverActions.allowedOrigins` — this app uses no
  // Server Actions (verified: zero `use server`), and the old `['*']` value
  // disabled Next's built-in Server-Action origin/CSRF check (SEC-5). The
  // session cookie is sameSite:'lax', which already blocks cross-site
  // state-changing POSTs to the API routes.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default withSerwist(nextConfig)
