import Link from 'next/link'

const linkStyle: React.CSSProperties = {
  display: 'block',
  padding: '12px 16px',
  borderRadius: 8,
  border: '1px solid #2e7d32',
  color: '#2e7d32',
  textDecoration: 'none',
  fontWeight: 600,
}

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 'max(24px, env(safe-area-inset-top)) 24px',
      }}
    >
      <section style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        <h1 style={{ marginBottom: 8 }}>You&apos;re offline</h1>
        <p style={{ marginBottom: 20, color: '#555' }}>
          AHITS can&apos;t reach the network right now. Your cached screens still work, and
          anything you do is queued and syncs automatically when your connection returns.
        </p>
        <div style={{ display: 'grid', gap: 12, maxWidth: 320, margin: '0 auto' }}>
          <Link href="/operator/daily-check" style={linkStyle}>Daily Check</Link>
          <Link href="/operator/scan" style={linkStyle}>Scan / Check In · Out</Link>
          <Link href="/operator/my-rig" style={linkStyle}>My Rig</Link>
          <Link href="/operator/dashboard" style={linkStyle}>Dashboard</Link>
        </div>
      </section>
    </main>
  )
}
