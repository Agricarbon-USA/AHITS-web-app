import { SignJWT } from 'jose'
import type { UserRole } from '@prisma/client'

// ─────────────────────────────────────────────────────────────────────────
// CC-29 item 5 — the SINGLE, edge-safe definition of session minting + the
// cookie shape, imported by BOTH src/lib/auth/session.ts (login/change-pin) AND
// src/proxy.ts (sliding renewal). It deliberately imports ONLY `jose` and a
// type-only `UserRole` (erased at compile) — NO prisma, NO next/headers — so the
// edge middleware bundle stays clean. Having one definition means the two callers
// can't drift on duration, claims, or cookie flags.
// ─────────────────────────────────────────────────────────────────────────

export const SESSION_COOKIE = 'ahits_session'
export const SESSION_DURATION = 60 * 60 * 24 // 24h, in seconds
// Absolute cap on a sliding session, measured from the original PIN entry (authAt).
// Sliding renewal keeps an ACTIVELY-used token alive, but never past this — a stolen
// token's usable life is bounded to ≤14 days since login, never infinite.
export const MAX_SESSION_LIFETIME = 60 * 60 * 24 * 14 // 14 days, in seconds

export interface RenewableClaims {
  userId: string
  role: UserRole
  name: string
  email: string
  tokenVersion: number
  mustChangePin?: boolean
  // Epoch SECONDS of the original PIN entry. Carried UNCHANGED through every renewal
  // so the 14-day cap is measured from login, not from the last renewal.
  authAt: number
}

function getSecret() {
  const secret = process.env.PIN_SESSION_SECRET
  if (!secret) throw new Error('PIN_SESSION_SECRET not set')
  return new TextEncoder().encode(secret)
}

// The cookie flags — the ONE definition shared by setSessionCookie() and the proxy
// renewal, so httpOnly/secure/sameSite/maxAge/path can't drift between them.
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_DURATION,
    path: '/',
  }
}

// Sign a fresh 24h token carrying exactly these claims. `authAt` is required and
// signed verbatim (createSession stamps it "now"; renewal carries it through).
export async function mintSessionToken(claims: RenewableClaims): Promise<string> {
  return new SignJWT({
    userId: claims.userId,
    role: claims.role,
    name: claims.name,
    email: claims.email,
    tokenVersion: claims.tokenVersion,
    mustChangePin: claims.mustChangePin === true,
    authAt: claims.authAt,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret())
}

/**
 * Given a VERIFIED JWT payload and the current epoch-seconds, decide whether to
 * re-mint. Returns the new token when the session is past half-life AND still within
 * MAX_SESSION_LIFETIME of authAt; otherwise null (no renewal — let it expire naturally
 * once past the cap, or ride the current token until half-life). The re-mint carries
 * the SAME claims and the SAME authAt — only `exp` (and `iat`) move. Instant revocation
 * is unaffected: every API route still runs DB-backed getSession() (tokenVersion /
 * isActive / role), so suspend/force-logout kill a renewed token on its next request.
 */
export async function maybeRenewSessionToken(
  payload: Record<string, unknown>,
  nowSec: number,
): Promise<string | null> {
  const iat = typeof payload.iat === 'number' ? payload.iat : null
  if (iat == null) return null
  // A pre-CC-29 token has no authAt → anchor the cap to its iat (best available).
  const authAt = typeof payload.authAt === 'number' ? payload.authAt : iat
  if (nowSec <= iat + SESSION_DURATION / 2) return null // not yet past half-life
  if (nowSec - authAt > MAX_SESSION_LIFETIME) return null // past the absolute cap
  return mintSessionToken({
    userId: String(payload.userId),
    role: payload.role as UserRole,
    name: String(payload.name),
    email: String(payload.email),
    tokenVersion: typeof payload.tokenVersion === 'number' ? payload.tokenVersion : 0,
    mustChangePin: payload.mustChangePin === true,
    authAt,
  })
}
