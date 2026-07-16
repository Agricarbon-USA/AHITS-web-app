import * as Sentry from '@sentry/nextjs'

// CC-22: manual runtime Sentry wiring. Deliberately NOT @sentry/nextjs's
// build-time withSentryConfig()/NEXT_PUBLIC_SENTRY_DSN auto-wiring — the DSN
// must never be baked into the client bundle at build time, only injected
// per-request from the server (see src/components/SentryProvider.tsx +
// src/app/layout.tsx). Server-side reads SENTRY_DSN directly since this
// module only ever runs on the server. No-op entirely when the secret is
// unset, so a sandbox/local/CI run with no DSN never calls Sentry.init and
// never makes an outbound call.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    tracesSampleRate: 0, // error tracking only; perf tracing is out of scope for CC-22
  })
}

// Catches uncaught errors that escape route handlers / server rendering (an API
// route that catches its own errors and returns JSON never reaches this — this
// is for genuinely unhandled throws, e.g. the CC-22 admin debug probe). Params
// typed inline (matching Next's InstrumentationOnRequestError) rather than
// importing from next/dist internals, which aren't a public type surface.
export async function onRequestError(
  error: unknown,
  request: Readonly<{ path: string; method: string; headers: Record<string, string | string[] | undefined> }>,
) {
  if (!process.env.SENTRY_DSN) return
  const requestIdHeader = request.headers['x-request-id']
  const requestId = Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader
  Sentry.captureException(error, {
    tags: { request_id: requestId ?? 'unknown' },
    extra: { path: request.path, method: request.method },
  })
}
