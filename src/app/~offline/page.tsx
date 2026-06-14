import Link from 'next/link'

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <section style={{ maxWidth: 520, textAlign: 'center' }}>
        <h1 style={{ marginBottom: 8 }}>You are offline</h1>
        <p style={{ marginBottom: 16 }}>
          AHITS could not reach the network. You can continue to use cached
          screens, and queued actions will sync when your connection returns.
        </p>
        <Link href="/login">Return to login</Link>
      </section>
    </main>
  )
}
