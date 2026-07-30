'use client'

import * as React from 'react'
import { color, font } from '@/theme/tokens'

// UXP-1d: catches an error thrown by the ROOT LAYOUT itself. Next replaces the whole
// layout here, so this file must render its own <html>/<body> and cannot reach the
// MUI theme — hence inline styles sourced from the design tokens (imported constants,
// not raw hex, so the CC-23 lint is satisfied) and no external fonts/images
// (offline-tolerant). No Sentry call: the framework's global handlers already capture.
// Home links to "/" (routes to the right dashboard by session) since this boundary
// has no reliable role context.
export default function GlobalError() {
  const wrap: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: 24,
    gap: 16,
  }
  const btnBase: React.CSSProperties = {
    minHeight: 48,
    padding: '0 20px',
    borderRadius: 8,
    fontSize: font.size.md,
    fontWeight: font.weight.medium,
    cursor: 'pointer',
    border: `1px solid ${color.brand}`,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: font.family, background: color.canvas, color: color.ink }}>
        <div style={wrap}>
          <div style={{ color: color.brand, fontWeight: font.weight.bold, fontSize: font.size.h5, letterSpacing: 1 }}>
            AHITS
          </div>
          <h1 style={{ margin: 0, fontSize: font.size.h6, fontWeight: font.weight.medium }}>
            Something went wrong
          </h1>
          <p style={{ margin: 0, maxWidth: 420, color: color.inkSoft, fontSize: font.size.base }}>
            The app hit an unexpected error before it could load. Reload to try again.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ ...btnBase, background: color.brand, color: color.brandContrast }}
            >
              Reload
            </button>
            <a href="/" style={{ ...btnBase, background: color.surface, color: color.brand }}>
              Go to Home
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
