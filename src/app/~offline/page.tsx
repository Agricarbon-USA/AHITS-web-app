import Link from 'next/link'
import { headers } from 'next/headers'
import { color, font } from '@/theme/tokens'

// CC-23: this offline fallback is served by the service worker and rendered
// outside the MUI theme, so it pulls brand palette/type from tokens.ts directly
// rather than re-hardcoding the green.
const linkStyle: React.CSSProperties = {
  display: 'block',
  padding: '12px 16px',
  borderRadius: 8,
  border: `1px solid ${color.brand}`,
  color: color.brand,
  textDecoration: 'none',
  fontWeight: font.weight.medium,
}

// Hotfix 2026-10-25 (H2-c): this page has nothing to lose, so it reloads itself when signal returns. An inline script, not a client component: the service worker can serve this HTML after a deploy has removed its JS chunks. The nonce lets it pass the CSP.
const RELOAD_WHEN_ONLINE = "window.addEventListener('online',function(){location.reload()})"

export default async function OfflinePage() {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 'max(24px, env(safe-area-inset-top)) 24px',
      }}
    >
      <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: RELOAD_WHEN_ONLINE }} />
      <section style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        <h1 style={{ marginBottom: 8 }}>You&apos;re offline</h1>
        <p style={{ marginBottom: 20, color: color.inkSoft }}>
          AHITS can&apos;t reach the network right now. Your cached screens still work, and
          anything you do is queued and syncs automatically when your connection returns.
        </p>
        <div style={{ display: 'grid', gap: 12, maxWidth: 320, margin: '0 auto' }}>
          <Link href="/operator/daily-check" style={linkStyle}>Daily Check</Link>
          {/* CC-32 (1.2): one custody pair, always Out-then-In — matches the
              dashboard's Scan card exactly (the reversed order is retired). */}
          <Link href="/operator/scan" style={linkStyle}>Scan / Check Out · In</Link>
          <Link href="/operator/my-deployment" style={linkStyle}>My Deployment</Link>
          <Link href="/operator/dashboard" style={linkStyle}>Dashboard</Link>
        </div>
      </section>
    </main>
  )
}
