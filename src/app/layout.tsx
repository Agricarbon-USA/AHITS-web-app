import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { Providers } from './providers'
import { SentryProvider } from '@/components/shared/SentryProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'AHITS — Agricarbon',
  description: 'Agricarbon Hardware Inventory & Tracking System',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-180.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AHITS',
  },
}

export const viewport: Viewport = {
  themeColor: '#2e7d32',
  width: 'device-width',
  initialScale: 1,
  // Allow pinch-zoom (WCAG 2.1 AA, PRD §9) — do not lock maximumScale.
  // viewport-fit:cover lets us pad around the iOS notch via safe-area insets.
  viewportFit: 'cover',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Reading x-nonce opts every page into per-request dynamic rendering.
  // This is required for Next.js to stamp the per-request nonce from
  // Content-Security-Policy onto its generated <script> tags (app-render.js
  // reads content-security-policy from req.headers, which is only populated
  // correctly on a live request, not at static build time).
  const hdrs = await headers()

  // CC-22: DSN read server-side (never NEXT_PUBLIC_, never hardcoded) and
  // passed to the client provider as a prop — not via env inlined at build
  // time. requestId is the same id src/proxy.ts already stamps on every
  // authenticated request, so a client-side Sentry event correlates to the
  // server-side logs/onRequestError capture for that same request.
  const sentryDsn = process.env.SENTRY_DSN ?? null
  const requestId = hdrs.get('x-request-id') ?? ''

  return (
    <html lang="en">
      <body>
        <SentryProvider dsn={sentryDsn} requestId={requestId}>
          <Providers>{children}</Providers>
        </SentryProvider>
      </body>
    </html>
  )
}
