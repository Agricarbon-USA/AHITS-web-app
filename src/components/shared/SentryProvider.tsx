'use client'

import * as React from 'react'
import * as Sentry from '@sentry/nextjs'

// CC-22: manual client-side Sentry init, fed the DSN + x-request-id as props
// from the server (src/app/layout.tsx reads SENTRY_DSN and the request's
// x-request-id header, both server-only values). This is deliberately NOT the
// instrumentation-client.ts convention — that file is static module code that
// runs pre-hydration and cannot receive per-request server data, so it can't
// carry a dynamically-configured DSN or the current request's id.
//
// Module-level (not per-instance) init guard: React 19 Strict Mode
// double-invokes effects in dev, and client-side navigation can remount this
// provider without a full page reload — Sentry.init must run at most once per
// page load regardless.
let clientInitialized = false

export function SentryProvider({
  dsn,
  requestId,
  children,
}: {
  dsn: string | null
  requestId: string
  children: React.ReactNode
}) {
  React.useEffect(() => {
    // No-op when the DSN is absent — no Sentry.init call, no outbound network
    // activity, matching the server-side no-op-when-unset behavior.
    if (!dsn) return
    if (!clientInitialized) {
      Sentry.init({ dsn, tracesSampleRate: 0 })
      clientInitialized = true
    }
    Sentry.setTag('request_id', requestId)
  }, [dsn, requestId])

  return <>{children}</>
}
